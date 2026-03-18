"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Use webpack's new URL() bundling to resolve the worker correctly in Next.js
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
}

interface Props {
  file: File;
  onConfirm: (selectedPages: number[]) => void; // 1-indexed page numbers
}

export default function PDFPagePicker({ file, onConfirm }: Props) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set()); // 0-indexed
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;

        const numPages = pdf.numPages;
        const result: string[] = [];

        // Default: select all pages except page 1 (usually account summary)
        const defaultSelected = new Set<number>();
        for (let i = 1; i < numPages; i++) defaultSelected.add(i);
        if (numPages === 1) defaultSelected.add(0);
        if (!cancelled) setSelected(defaultSelected);

        for (let i = 1; i <= numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement("canvas");
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          result.push(canvas.toDataURL("image/png").split(",")[1]);
          if (!cancelled) setThumbs([...result]);
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === thumbs.length) setSelected(new Set());
    else setSelected(new Set(thumbs.map((_, i) => i)));
  }

  function handleConfirm() {
    if (selected.size === 0) return;
    // Convert 0-indexed to 1-indexed page numbers
    const pages = [...selected].sort((a, b) => a - b).map(i => i + 1);
    onConfirm(pages);
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-100">Select pages to analyse</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Page 1 is usually the account summary — deselect it to skip sensitive info.
          </p>
        </div>
        <button onClick={toggleAll} className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
          {selected.size === thumbs.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      {loadError && (
        <div className="text-xs text-red-400">Failed to load PDF: {loadError}</div>
      )}

      {loading && thumbs.length === 0 && !loadError && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          Rendering pages…
        </div>
      )}

      {/* Page grid */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {thumbs.map((thumb, i) => {
          const isSelected = selected.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={[
                "relative flex flex-col items-center gap-1 rounded-lg border-2 p-1 transition-all",
                isSelected
                  ? "border-blue-500 bg-blue-950/30"
                  : "border-zinc-700 bg-zinc-800/50 opacity-50",
              ].join(" ")}
            >
              <img
                src={`data:image/png;base64,${thumb}`}
                alt={`Page ${i + 1}`}
                className="w-full rounded object-contain"
              />
              {isSelected && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              <span className="text-[10px] text-zinc-400">p.{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Confirm */}
      {!loading && !loadError && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {`Extract from ${selectedCount} page${selectedCount !== 1 ? "s" : ""}`}
          </button>
          <span className="text-xs text-zinc-500">{selectedCount} of {thumbs.length} pages selected</span>
        </div>
      )}
    </div>
  );
}
