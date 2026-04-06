"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import UploadZone from "@/components/UploadZone";
import ScrubPreview from "@/components/ScrubPreview";
import PDFPagePicker from "@/components/PDFPagePicker";
import ModelPicker from "@/components/ModelPicker";

// ─── Draft persistence (localStorage) ─────────────────────────────────────────

interface Draft {
  filename: string;
  fileSizeKb: number;
  rawText: string;
  scrubbedText?: string;
  redactions?: string[];
  redactionCount?: number;
  numPages?: number;
  savedAt: string; // ISO
}

const DRAFTS_KEY = "finance-statement-drafts";

function loadDrafts(): Draft[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]"); } catch { return []; }
}

function saveDraft(draft: Draft) {
  const all = loadDrafts();
  const idx = all.findIndex(d => d.filename === draft.filename);
  if (idx >= 0) all[idx] = draft; else all.push(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
}

function removeDraft(filename: string) {
  const all = loadDrafts().filter(d => d.filename !== filename);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type FileStatus =
  | "pending"
  | "picking"      // waiting for user to select pages
  | "converting"   // sending to vision AI
  | "scrubbing"
  | "ready"
  | "saving"
  | "approved"
  | "error";

interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  numPages?: number;
  rawText?: string;
  scrubbedText?: string;
  finalScrubbedText?: string;
  manualTerms?: string[];
  redactions?: string[];
  redactionCount?: number;
  savedId?: string;
  previewOpen: boolean;
  fromDraft?: boolean;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [navigating, setNavigating] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedModel, setSelectedModel] = useState("local:gemma4:e2b");

  // Load persisted model on mount
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then((cfg: { selectedModel?: string }) => {
      if (cfg.selectedModel) setSelectedModel(cfg.selectedModel);
    }).catch(() => {});
  }, []);

  function handleModelChange(model: string) {
    setSelectedModel(model);
    fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedModel: model }) }).catch(() => {});
  }

  // Load drafts on mount
  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  function refreshDrafts() {
    setDrafts(loadDrafts());
  }

  function updateEntry(id: string, patch: Partial<FileEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  // Restore a draft — creates a ready entry without re-running LLM
  function restoreDraft(draft: Draft) {
    // Avoid duplicate
    if (entries.some(e => e.file.name === draft.filename)) return;
    const fakeFile = new File([], draft.filename);
    const entry: FileEntry = {
      id: `draft-${draft.filename}-${Date.now()}`,
      file: fakeFile,
      status: draft.scrubbedText ? "ready" : "converting",
      numPages: draft.numPages,
      rawText: draft.rawText,
      scrubbedText: draft.scrubbedText,
      redactions: draft.redactions ?? [],
      redactionCount: draft.redactionCount ?? 0,
      previewOpen: false,
      fromDraft: true,
    };
    setEntries((prev) => [...prev, entry]);

    // If only rawText saved (scrub hadn't finished), run scrub now
    if (!draft.scrubbedText) {
      runScrub(entry.id, draft.rawText, draft.filename, draft.fileSizeKb);
    }
  }

  // Called when user confirms page selection in the picker
  async function onPagesConfirmed(entryId: string, selectedPages: number[], images: string[]) {
    updateEntry(entryId, { status: "converting" });

    const entry = entries.find(e => e.id === entryId)!;
    const isLocal = selectedModel.startsWith("local:");

    let rawText: string;
    try {
      if (isLocal) {
        // Local model: send high-res page images directly
        const localModelName = selectedModel.slice(6);
        const res = await fetch("/api/parse-pdf-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images, model: localModelName }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        rawText = data.text;
      } else {
        // Cloud model (Claude): send raw PDF
        const arrayBuffer = await entry.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const pdfBase64 = btoa(binary);
        const res = await fetch("/api/parse-pdf-vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf: pdfBase64, pages: selectedPages }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        rawText = data.text;
      }
    } catch (err) {
      updateEntry(entryId, {
        status: "error",
        error: err instanceof Error ? err.message : "Failed to extract text from PDF",
      });
      return;
    }

    // Save draft after extraction (before scrub — preserve LLM work if scrub fails)
    saveDraft({
      filename: entry.file.name,
      fileSizeKb: Math.round(entry.file.size / 1024),
      rawText,
      numPages: selectedPages.length,
      savedAt: new Date().toISOString(),
    });
    refreshDrafts();

    await runScrub(entryId, rawText, entry.file.name, Math.round(entry.file.size / 1024), selectedPages.length);
  }

  async function runScrub(entryId: string, rawText: string, filename: string, fileSizeKb: number, numPages?: number) {
    updateEntry(entryId, { status: "scrubbing", rawText, numPages });
    try {
      const res = await fetch("/api/scrub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { scrubbed, redactions, redactionCount } = await res.json();
      updateEntry(entryId, { status: "ready", scrubbedText: scrubbed, redactions, redactionCount });

      // Update draft with scrubbed text
      saveDraft({
        filename,
        fileSizeKb,
        rawText,
        scrubbedText: scrubbed,
        redactions,
        redactionCount,
        numPages,
        savedAt: new Date().toISOString(),
      });
      refreshDrafts();
    } catch (err) {
      updateEntry(entryId, {
        status: "error",
        error: err instanceof Error ? err.message : "Failed to scrub text",
      });
    }
  }

  function processFile(entry: FileEntry) {
    updateEntry(entry.id, { status: "picking" });
  }

  async function onFiles(files: File[]) {
    const newEntries: FileEntry[] = files
      .filter((f) => !entries.some((e) => e.file.name === f.name))
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as FileStatus,
        previewOpen: false,
      }));

    if (newEntries.length === 0) return;

    setEntries((prev) => [...prev, ...newEntries]);
    await Promise.all(newEntries.map(processFile));
  }

  async function approveFile(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry?.rawText || !entry.scrubbedText) return;

    updateEntry(id, { status: "saving" });

    const scrubbedToSave = entry.finalScrubbedText ?? entry.scrubbedText;
    const totalRedactions = (entry.redactionCount ?? 0) + (entry.manualTerms?.length ?? 0);

    try {
      const res = await fetch("/api/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: entry.file.name,
          numPages: entry.numPages ?? 0,
          rawText: entry.rawText,
          scrubbedText: scrubbedToSave,
          redactionCount: totalRedactions,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id: savedId } = await res.json();
      updateEntry(id, { status: "approved", savedId });

      // Draft no longer needed after approval
      removeDraft(entry.file.name);
      refreshDrafts();
    } catch (err) {
      updateEntry(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Failed to save statement",
      });
    }
  }

  function removeFile(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function togglePreview(id: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, previewOpen: !e.previewOpen } : e
      )
    );
  }

  function goToAnalyse() {
    const ids = entries
      .filter((e) => e.status === "approved" && e.savedId)
      .map((e) => e.savedId!);
    if (ids.length === 0) return;
    setNavigating(true);
    router.push(`/analyse?ids=${ids.join(",")}`);
  }

  // Drafts not already loaded as entries
  const activeFilenames = new Set(entries.map(e => e.file.name));
  const availableDrafts = drafts.filter(d => !activeFilenames.has(d.filename));

  const approvedEntries = entries.filter((e) => e.status === "approved");
  const processingCount = entries.filter(
    (e) =>
      e.status === "converting" ||
      e.status === "scrubbing" ||
      e.status === "saving"
  ).length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold text-zinc-100">Upload Statements</h1>
        <ModelPicker value={selectedModel} onChange={handleModelChange} />
        {approvedEntries.length > 0 && (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={processingCount > 0 || navigating}
            onClick={goToAnalyse}
          >
            {navigating && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {navigating ? "Loading…" : `Analyse ${approvedEntries.length} statement${approvedEntries.length !== 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      <main className="px-8 py-6 flex flex-col gap-6">
        {/* Saved drafts */}
        {availableDrafts.length > 0 && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-4 flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Previously extracted — resume without re-running AI
            </p>
            <div className="flex flex-col gap-2">
              {availableDrafts.map((draft) => (
                <div key={draft.filename} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-red-950/50">
                      <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14.25 2.25H6a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 006 21.75h12A2.25 2.25 0 0020.25 19.5V8.25L14.25 2.25z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{draft.filename}</p>
                      <p className="text-xs text-zinc-500">
                        {draft.fileSizeKb} KB
                        {draft.numPages ? ` · ${draft.numPages} pages` : ""}
                        {draft.scrubbedText ? " · ready to approve" : " · needs scrubbing"}
                        {" · saved "}
                        {new Date(draft.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => restoreDraft(draft)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => { removeDraft(draft.filename); refreshDrafts(); }}
                      className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      aria-label="Discard draft"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <UploadZone onFiles={onFiles} disabled={processingCount > 0} />

        {entries.length > 0 && (
          <div className="flex flex-col gap-4">
            {entries.map((entry) => (
              <FileCard
                key={entry.id}
                entry={entry}
                onApprove={() => approveFile(entry.id)}
                onRemove={() => removeFile(entry.id)}
                onTogglePreview={() => togglePreview(entry.id)}
                onScrubChange={(finalScrubbedText, manualTerms) =>
                  updateEntry(entry.id, { finalScrubbedText, manualTerms })
                }
                onPagesConfirmed={(pages, images) => onPagesConfirmed(entry.id, pages, images)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── FileCard ──────────────────────────────────────────────────────────────────

interface FileCardProps {
  entry: FileEntry;
  onApprove: () => void;
  onRemove: () => void;
  onTogglePreview: () => void;
  onScrubChange: (finalScrubbedText: string, manualTerms: string[]) => void;
  onPagesConfirmed: (selectedPages: number[], images: string[]) => void;
}

function FileCard({ entry, onApprove, onRemove, onTogglePreview, onScrubChange, onPagesConfirmed }: FileCardProps) {
  const { file, status, error, numPages, redactionCount, previewOpen } = entry;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-zinc-900">
      {/* Card header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* PDF icon */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-950/50">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.25 2.25H6a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 006 21.75h12A2.25 2.25 0 0020.25 19.5V8.25L14.25 2.25z" />
            <path d="M14.25 2.25v6h6" className="fill-red-900" />
          </svg>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{file.name}</p>
          <p className="text-xs text-zinc-500">
            {file.size > 0 ? `${(file.size / 1024).toFixed(0)} KB` : ""}
            {numPages ? `${file.size > 0 ? " · " : ""}${numPages} page${numPages !== 1 ? "s" : ""}` : ""}
            {entry.fromDraft && <span className="ml-1 text-blue-500">· restored</span>}
          </p>
        </div>

        {/* Status badge */}
        <StatusBadge status={status} redactionCount={redactionCount} />

        {/* Actions */}
        <div className="flex items-center gap-2">
          {(status === "ready" || status === "approved") && (
            <button
              onClick={onTogglePreview}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
            >
              {previewOpen ? "Hide preview" : "Preview scrub"}
            </button>
          )}

          {status === "ready" && (
            <button
              onClick={onApprove}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500"
            >
              Approve & Continue
            </button>
          )}

          {status === "approved" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-950/50 px-3 py-1.5 text-xs font-semibold text-green-300">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Approved
            </span>
          )}

          <button
            onClick={onRemove}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Remove file"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Error message */}
      {status === "error" && error && (
        <div className="border-t border-red-900/50 bg-red-950/30 px-5 py-3">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Page picker */}
      {status === "picking" && (
        <div className="border-t border-zinc-800 px-5 py-4">
          <PDFPagePicker file={file} onConfirm={onPagesConfirmed} />
        </div>
      )}

      {/* Converting spinner */}
      {status === "converting" && (
        <div className="border-t border-zinc-800 px-5 py-4 flex items-center gap-2 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-400" />
          Extracting transactions with AI vision…
        </div>
      )}

      {/* Scrubbing spinner */}
      {status === "scrubbing" && (
        <div className="border-t border-zinc-800 px-5 py-4 flex items-center gap-2 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-400" />
          Scrubbing PII…
        </div>
      )}

      {/* Scrub preview panel */}
      {previewOpen && entry.rawText && entry.scrubbedText && (
        <div className="border-t border-zinc-800 px-5 py-4">
          <ScrubPreview
            rawText={entry.rawText}
            scrubbedText={entry.scrubbedText}
            redactions={entry.redactions ?? []}
            redactionCount={entry.redactionCount ?? 0}
            onChange={onScrubChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  redactionCount,
}: {
  status: FileStatus;
  redactionCount?: number;
}) {
  if (status === "picking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 border border-zinc-700">
        <span className="h-2 w-2 rounded-full bg-zinc-400" />
        Select pages
      </span>
    );
  }

  if (status === "converting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-950/50 px-2.5 py-1 text-xs font-medium text-blue-300 border border-blue-800">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        Extracting…
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
        <span className="h-2 w-2 rounded-full bg-zinc-600" />
        Queued
      </span>
    );
  }

  if (status === "scrubbing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-950/50 px-2.5 py-1 text-xs font-medium text-violet-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
        Scrubbing PII…
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
        Saving…
      </span>
    );
  }

  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/50 px-2.5 py-1 text-xs font-medium text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        {redactionCount ?? 0} redaction{redactionCount !== 1 ? "s" : ""}
      </span>
    );
  }

  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-950/50 px-2.5 py-1 text-xs font-medium text-green-300">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        Approved
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/50 px-2.5 py-1 text-xs font-medium text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Error
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
      <span className="h-2 w-2 rounded-full bg-zinc-600" />
      Queued
    </span>
  );
}
