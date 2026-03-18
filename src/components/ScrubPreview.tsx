"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Best-effort transaction parser — handles CIBC single-line AND multi-line PDF formats
// ---------------------------------------------------------------------------
interface PreviewTxn {
  date: string;
  description: string;
  amount: string;
  amountNum: number;
  type: "debit" | "credit" | "?";
}

// Date patterns — tested against trimmed line or start of line
const DATE_PATTERNS = [
  // "Jan 05, 2026" or "Jan 5, 2026" or "Jan 05 2026"
  /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:[,\s]+\d{4})?)/i,
  // "January 5, 2026"
  /^((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:[,\s]+\d{4})?)/i,
  // "2026-01-05"
  /^(\d{4}-\d{2}-\d{2})/,
  // "01/05/2026" or "01/05/26" or "01/05"
  /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
  // "05-Jan-26" or "05-Jan-2026"
  /^(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4})/i,
];

// A standalone amount line: optional $, digits, comma-groups, dot, 2 decimals
const STANDALONE_AMT = /^\$?([\d,]+\.\d{2})$/;
// Amount anywhere in a string
const ANY_AMT = /([\d,]+\.\d{2})/g;

const CREDIT_HINTS   = /\b(deposit|refund|e-?transfer\s*(from|received|in)|payroll|salary|direct.?deposit|payment.?received|payment\s*-\s*thank|credit(?!\s*card)|cashback|return|rebate)\b/i;
const SKIP_LINES     = /^(opening|closing|previous|new|statement|balance|total|payments|purchases|interest|minimum|due date|page|account|dear|hello|transactions|date\s+description|withdrawal|deposit)\b/i;

function matchDate(line: string): string | null {
  for (const re of DATE_PATTERNS) {
    const m = line.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractAmount(str: string): { amtStr: string; amtNum: number } | null {
  const m = STANDALONE_AMT.exec(str.trim());
  if (m) return { amtStr: m[1], amtNum: parseFloat(m[1].replace(/,/g, "")) };
  const all = [...str.matchAll(ANY_AMT)];
  if (all.length > 0) {
    const amtStr = all[0][1];
    return { amtStr, amtNum: parseFloat(amtStr.replace(/,/g, "")) };
  }
  return null;
}

function parseMarkdownTable(text: string): PreviewTxn[] {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
  if (lines.length < 2) return [];

  // Header row
  const headers = lines[0].split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
  const dateIdx = headers.findIndex(h => h.includes("date"));
  const descIdx = headers.findIndex(h => h.includes("desc") || h.includes("detail") || h.includes("transaction") || h.includes("narr"));
  const wdIdx   = headers.findIndex(h => h.includes("withdraw") || h.includes("debit") || h.includes("charge") || h.includes("amount"));
  const depIdx  = headers.findIndex(h => h.includes("deposit") || h.includes("credit") || h.includes("payment"));

  const results: PreviewTxn[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip separator rows
    if (/^[\s|:-]+$/.test(line)) continue;

    const cols = line.split("|").slice(1, -1).map(c => c.trim());
    if (cols.length < 2) continue;

    const date = dateIdx >= 0 ? (cols[dateIdx] ?? "") : "";
    const desc = descIdx >= 0 ? (cols[descIdx] ?? "") : (cols[1] ?? "");
    const wd   = wdIdx  >= 0 ? (cols[wdIdx]  ?? "") : "";
    const dep  = depIdx >= 0 ? (cols[depIdx] ?? "") : "";

    // Skip rows with no date and no amount (blank spacer rows)
    if (!date && !wd && !dep) continue;

    const amtRaw = wd || dep;
    const amtNum = parseFloat(amtRaw.replace(/[$,\s]/g, "")) || 0;
    const type: "debit" | "credit" | "?" = wd && amtNum > 0 ? "debit" : dep && amtNum > 0 ? "credit" : "?";

    results.push({
      date,
      description: desc || "(no description)",
      amount: amtRaw.replace(/[$,\s]/g, ""),
      amountNum: amtNum,
      type,
    });
  }

  return results;
}

function parseTransactions(text: string): PreviewTxn[] {
  // If the text looks like a markdown table, use the dedicated parser
  const trimmed = text.trimStart();
  if (trimmed.startsWith("|")) return parseMarkdownTable(text);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const results: PreviewTxn[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip header/summary lines
    if (SKIP_LINES.test(line)) { i++; continue; }

    const dateMatch = matchDate(line);
    if (!dateMatch) { i++; continue; }

    const dateStr = dateMatch;
    const afterDate = line.slice(dateMatch.length).replace(/^[,\s]+/, "").trim();
    i++;

    // ----- Strategy A: everything on one line (date + description + amount) -----
    if (afterDate.length > 0) {
      const amtResult = extractAmount(afterDate);
      if (amtResult) {
        // Description = everything before the first amount
        const amtIdx = afterDate.search(ANY_AMT);
        const desc = (amtIdx > 0 ? afterDate.slice(0, amtIdx) : afterDate).trim().replace(/\s+/g, " ");
        if (desc.length > 0 || amtResult.amtNum > 0) {
          const type = CREDIT_HINTS.test(desc) ? "credit" : "?";
          results.push({ date: dateStr, description: desc || "(no description)", amount: amtResult.amtStr, amountNum: amtResult.amtNum, type });
          continue;
        }
      }
      // Date + description on same line, amount on next line(s)
      let desc = afterDate;
      while (i < lines.length && !matchDate(lines[i]) && !SKIP_LINES.test(lines[i])) {
        const candidate = lines[i];
        const amtResult = extractAmount(candidate);
        if (amtResult && candidate.replace(/[$,.\d\s]/g, "").length === 0) {
          // This line is just an amount
          const type = CREDIT_HINTS.test(desc) ? "credit" : "?";
          results.push({ date: dateStr, description: desc.replace(/\s+/g, " "), amount: amtResult.amtStr, amountNum: amtResult.amtNum, type });
          i++;
          break;
        }
        // More description text
        desc += " " + candidate;
        i++;
      }
      continue;
    }

    // ----- Strategy B: date on its own line; description + amount follow -----
    let desc = "";
    let amountFound = false;
    while (i < lines.length && !matchDate(lines[i]) && !SKIP_LINES.test(lines[i])) {
      const candidate = lines[i];
      const amtResult = extractAmount(candidate);
      // Pure amount line?
      if (amtResult && candidate.replace(/[$,.\d\s]/g, "").length === 0) {
        if (desc.length > 0) {
          const type = CREDIT_HINTS.test(desc) ? "credit" : "?";
          results.push({ date: dateStr, description: desc.trim().replace(/\s+/g, " "), amount: amtResult.amtStr, amountNum: amtResult.amtNum, type });
          amountFound = true;
          i++;
          break;
        }
      }
      // Description line that also has an amount embedded
      if (!amountFound && amtResult && candidate.replace(/[$,.\d\s]/g, "").length > 0) {
        const amtIdx = candidate.search(ANY_AMT);
        const descPart = (amtIdx > 0 ? candidate.slice(0, amtIdx) : candidate).trim();
        desc += (desc ? " " : "") + descPart;
        const type = CREDIT_HINTS.test(desc) ? "credit" : "?";
        results.push({ date: dateStr, description: desc.trim().replace(/\s+/g, " "), amount: amtResult.amtStr, amountNum: amtResult.amtNum, type });
        amountFound = true;
        i++;
        break;
      }
      desc += (desc ? " " : "") + candidate;
      i++;
    }
  }

  return results;
}

interface ScrubPreviewProps {
  rawText: string;
  scrubbedText: string;
  redactionCount: number;
  redactions: string[];
  onChange?: (finalScrubbedText: string, manualTerms: string[]) => void;
}

type SegmentKind = "plain" | "auto" | "manual";
interface Segment { text: string; kind: SegmentKind }

// Build an array of labelled text segments for highlighting
function buildSegments(text: string, manualTerms: string[]): Segment[] {
  type Hit = { start: number; end: number; kind: SegmentKind };
  const hits: Hit[] = [];

  // Auto-redacted tokens
  const autoRe = /\[[A-Z_]+_REDACTED\]/g;
  let m: RegExpExecArray | null;
  while ((m = autoRe.exec(text)) !== null) {
    hits.push({ start: m.index, end: m.index + m[0].length, kind: "auto" });
  }

  // Manual terms (applied to both raw and scrubbed display)
  for (const term of manualTerms) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, kind: "manual" });
    }
  }

  hits.sort((a, b) => a.start - b.start);

  // Remove overlaps (keep earlier hit)
  const deduped: Hit[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start >= cursor) { deduped.push(hit); cursor = hit.end; }
  }

  const segs: Segment[] = [];
  cursor = 0;
  for (const hit of deduped) {
    if (hit.start > cursor) segs.push({ text: text.slice(cursor, hit.start), kind: "plain" });
    segs.push({ text: text.slice(hit.start, hit.end), kind: hit.kind });
    cursor = hit.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), kind: "plain" });

  return segs;
}

function HighlightedPre({
  text,
  manualTerms,
  preRef,
  onScroll,
  onMouseUp,
}: {
  text: string;
  manualTerms: string[];
  preRef: React.RefObject<HTMLPreElement | null>;
  onScroll: () => void;
  onMouseUp: (e: React.MouseEvent<HTMLPreElement>) => void;
}) {
  const segments = useMemo(() => buildSegments(text, manualTerms), [text, manualTerms]);

  return (
    <pre
      ref={preRef}
      onScroll={onScroll}
      onMouseUp={onMouseUp}
      className="h-72 overflow-auto rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap break-words select-text cursor-text"
    >
      {segments.map((seg, i) => {
        if (seg.kind === "auto") {
          return (
            <mark key={i} className="rounded bg-amber-800/60 px-0.5 py-px text-amber-300">
              {seg.text}
            </mark>
          );
        }
        if (seg.kind === "manual") {
          return (
            <mark key={i} className="rounded bg-red-900/60 px-0.5 py-px text-red-300 line-through">
              {seg.text}
            </mark>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </pre>
  );
}

export default function ScrubPreview({
  rawText,
  scrubbedText,
  redactionCount,
  redactions,
  onChange,
}: ScrubPreviewProps) {
  const rawRef = useRef<HTMLPreElement>(null);
  const scrubbedRef = useRef<HTMLPreElement>(null);
  const syncing = useRef(false);

  const [manualTerms, setManualTerms] = useState<string[]>([]);
  const [pending, setPending] = useState<{ text: string; x: number; y: number } | null>(null);
  const [tab, setTab] = useState<"text" | "table">("text");

  // Compute final scrubbed text (auto scrub + manual replacements)
  const finalScrubbedText = useMemo(() => {
    let text = scrubbedText;
    for (const term of manualTerms) {
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      text = text.replace(re, "[MANUAL_REDACTED]");
    }
    return text;
  }, [scrubbedText, manualTerms]);

  // Keep a stable ref to onChange so the effect below doesn't need it as a dependency
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  // Notify parent when scrubbed content changes
  useEffect(() => {
    onChangeRef.current?.(finalScrubbedText, manualTerms);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalScrubbedText, manualTerms]);

  // Dismiss floating button on any outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const btn = document.getElementById("scrub-redact-btn");
      if (btn && !btn.contains(e.target as Node)) setPending(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Synchronized scroll
  function syncFrom(source: "raw" | "scrubbed") {
    if (syncing.current) return;
    syncing.current = true;
    const from = source === "raw" ? rawRef.current : scrubbedRef.current;
    const to   = source === "raw" ? scrubbedRef.current : rawRef.current;
    if (from && to) to.scrollTop = from.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }

  function handleMouseUp(e: React.MouseEvent<HTMLPreElement>) {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length > 0 && text.length <= 300) {
      setPending({ text, x: e.clientX, y: e.clientY });
    } else {
      setPending(null);
    }
  }

  function addRedaction() {
    if (!pending) return;
    const term = pending.text;
    setManualTerms((prev) => (prev.includes(term) ? prev : [...prev, term]));
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  function removeManualTerm(term: string) {
    setManualTerms((prev) => prev.filter((t) => t !== term));
  }

  const onRawScroll    = useCallback(() => syncFrom("raw"), []);
  const onScrubbedScroll = useCallback(() => syncFrom("scrubbed"), []);

  const totalRedactions = redactionCount + manualTerms.length;
  const parsedTxns = useMemo(() => parseTransactions(finalScrubbedText), [finalScrubbedText]);
  const totalDebits  = parsedTxns.filter(t => t.type !== "credit").reduce((s, t) => s + t.amountNum, 0);
  const totalCredits = parsedTxns.filter(t => t.type === "credit").reduce((s, t) => s + t.amountNum, 0);

  return (
    <div className="flex flex-col gap-3">

      {/* Summary badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={[
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
          totalRedactions > 0 ? "bg-amber-950/50 text-amber-300" : "bg-green-950/50 text-green-300",
        ].join(" ")}>
          {totalRedactions > 0
            ? `${redactionCount} auto + ${manualTerms.length} manual redacted`
            : "No PII detected"}
        </span>

        {redactions.slice(0, 5).map((r, i) => (
          <span key={i} className="inline-flex items-center rounded-full bg-amber-950/30 px-2.5 py-0.5 text-xs text-amber-400">
            {r.split(":")[0].replace("[", "")}
          </span>
        ))}
        {redactions.length > 5 && (
          <span className="text-xs text-zinc-500">+{redactions.length - 5} more</span>
        )}
      </div>

      {/* Manual redaction chips */}
      {manualTerms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 self-center">Manual:</span>
          {manualTerms.map((term) => (
            <span
              key={term}
              className="inline-flex items-center gap-1 rounded-full bg-red-950/50 px-2.5 py-0.5 text-xs text-red-300"
            >
              <span className="max-w-[120px] truncate">{term}</span>
              <button
                onClick={() => removeManualTerm(term)}
                className="ml-0.5 rounded-full hover:text-red-100"
                aria-label={`Remove redaction for "${term}"`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-700">
        {(["text", "table"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2 text-xs font-semibold transition-colors",
              tab === t
                ? "border-b-2 border-blue-500 text-blue-400 -mb-px"
                : "text-zinc-500 hover:text-zinc-300",
            ].join(" ")}
          >
            {t === "text" ? "Raw / Scrubbed" : `Transactions (${parsedTxns.length})`}
          </button>
        ))}
      </div>

      {tab === "text" && (
        <>
          <p className="text-xs text-zinc-500">Select any text in either pane to manually redact it.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Raw (original)</p>
              <HighlightedPre text={rawText} manualTerms={manualTerms} preRef={rawRef} onScroll={onRawScroll} onMouseUp={handleMouseUp} />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scrubbed (sent to AI)</p>
              <HighlightedPre text={finalScrubbedText} manualTerms={[]} preRef={scrubbedRef} onScroll={onScrubbedScroll} onMouseUp={handleMouseUp} />
            </div>
          </div>
        </>
      )}

      {tab === "table" && (
        <div className="flex flex-col gap-3">
          {/* Summary row */}
          <div className="flex gap-4 text-xs">
            <span className="text-zinc-400">{parsedTxns.length} transactions detected</span>
            {totalDebits > 0 && (
              <span className="text-red-400">
                Debits: ${totalDebits.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            {totalCredits > 0 && (
              <span className="text-green-400">
                Credits: ${totalCredits.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {parsedTxns.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              No transactions detected. The statement format may not be parseable in preview — the AI will still analyse it correctly.
            </p>
          ) : (
            <div className="overflow-auto rounded-lg border border-zinc-700 max-h-80">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-800 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-center font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {parsedTxns.map((txn, i) => (
                    <tr key={i} className="bg-zinc-900 hover:bg-zinc-800/60 transition-colors">
                      <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap">{txn.date}</td>
                      <td className="px-3 py-1.5 text-zinc-200 max-w-xs truncate">{txn.description}</td>
                      <td className={[
                        "px-3 py-1.5 text-right font-mono whitespace-nowrap",
                        txn.type === "credit" ? "text-green-400" : "text-zinc-200",
                      ].join(" ")}>
                        {txn.type === "credit" ? "+" : ""}${txn.amount}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {txn.type === "credit" ? (
                          <span className="rounded-full bg-green-950/60 px-2 py-0.5 text-green-400 text-[10px] font-medium">IN</span>
                        ) : txn.type === "debit" ? (
                          <span className="rounded-full bg-red-950/60 px-2 py-0.5 text-red-400 text-[10px] font-medium">OUT</span>
                        ) : (
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-500 text-[10px] font-medium">?</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-zinc-600">
            This is a best-effort preview. The AI analyses the full scrubbed text and may find more transactions.
          </p>
        </div>
      )}

      {/* Floating "Redact" button */}
      {pending && (
        <div
          id="scrub-redact-btn"
          style={{ position: "fixed", top: pending.y + 8, left: pending.x - 30, zIndex: 50 }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()} // keep selection alive
            onClick={addRedaction}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-red-500"
          >
            Redact selection
          </button>
        </div>
      )}
    </div>
  );
}
