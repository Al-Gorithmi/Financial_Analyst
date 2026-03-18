/**
 * Shared markdown table parser — used server-side (statements route) and
 * client-side (ScrubPreview preview tab).
 */

export interface RawTxnRow {
  date: string;        // raw date string from table
  dateISO: string;     // YYYY-MM-DD, best-effort
  description: string;
  withdrawals: string; // raw string, empty if not a withdrawal
  deposits: string;    // raw string, empty if not a deposit
  balance: string;     // raw string, may be empty
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

export function normaliseDateToISO(raw: string, fallbackYear = new Date().getFullYear()): string {
  if (!raw) return "";
  const s = raw.trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // "Jan 5, 2026" or "Jan 05 2026"
  const m1 = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})[,\s]+(\d{4})/);
  if (m1) {
    const mon = MONTH_MAP[m1[1].toLowerCase()];
    if (mon) return `${m1[3]}-${mon}-${m1[2].padStart(2, "0")}`;
  }

  // "Jan 5" (no year)
  const m2 = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})$/);
  if (m2) {
    const mon = MONTH_MAP[m2[1].toLowerCase()];
    if (mon) return `${fallbackYear}-${mon}-${m2[2].padStart(2, "0")}`;
  }

  // "2026-01-05" already matched above; try "01/05/2026" or "01/05/26"
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m3) {
    const yr = m3[3].length === 2 ? `20${m3[3]}` : m3[3];
    return `${yr}-${m3[1].padStart(2, "0")}-${m3[2].padStart(2, "0")}`;
  }

  return "";
}

export function parseMarkdownTable(rawText: string, uploadedAt?: string): RawTxnRow[] {
  const fallbackYear = uploadedAt ? new Date(uploadedAt).getFullYear() : new Date().getFullYear();
  const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
  if (lines.length < 2) return [];

  // Header row — find column indices
  const headers = lines[0].split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
  const dateIdx = headers.findIndex(h => h.includes("date"));
  const descIdx = headers.findIndex(h =>
    h.includes("desc") || h.includes("detail") || h.includes("transaction") || h.includes("narr")
  );
  const wdIdx  = headers.findIndex(h =>
    h.includes("withdraw") || h.includes("debit") || h.includes("charge") || h.includes("amount")
  );
  const depIdx = headers.findIndex(h =>
    h.includes("deposit") || h.includes("credit") || h.includes("payment")
  );
  const balIdx = headers.findIndex(h => h.includes("balance"));

  const results: RawTxnRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[\s|:-]+$/.test(line)) continue; // separator row

    const cols = line.split("|").slice(1, -1).map(c => c.trim());
    if (cols.length < 2) continue;

    const date        = dateIdx >= 0 ? (cols[dateIdx] ?? "") : "";
    const description = descIdx >= 0 ? (cols[descIdx] ?? "") : (cols[1] ?? "");
    const withdrawals = wdIdx  >= 0 ? (cols[wdIdx]  ?? "") : "";
    const deposits    = depIdx >= 0 ? (cols[depIdx] ?? "") : "";
    const balance     = balIdx >= 0 ? (cols[balIdx] ?? "") : "";

    // Skip totally empty rows
    if (!date && !withdrawals && !deposits) continue;

    results.push({
      date,
      dateISO: normaliseDateToISO(date, fallbackYear),
      description: description || "(no description)",
      withdrawals,
      deposits,
      balance,
    });
  }

  return results;
}

/** Parse a raw string like "1,234.56" or "$1234.56" to a float, returns 0 on failure */
export function parseAmount(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}
