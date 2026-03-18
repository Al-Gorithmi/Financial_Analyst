"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface StatementMeta {
  id: string;
  filename: string;
  uploadedAt: string;
  numPages: number;
  redactionCount: number;
  approved: boolean;
}

type LoadState = "loading" | "ready" | "error";

export default function StatementsPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [statements, setStatements] = useState<StatementMeta[]>([]);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/statements")
      .then((r) => r.json())
      .then((data) => {
        setStatements(data.statements ?? []);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  async function deleteStatement(id: string) {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await fetch("/api/statements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setStatements((prev) => prev.filter((s) => s.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } finally {
      setDeleting((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === statements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(statements.map((s) => s.id)));
    }
  }

  function goAnalyse() {
    const ids = Array.from(selected).join(",");
    router.push(`/analyse?ids=${ids}`);
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-100">Saved Statements</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={goAnalyse} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
              Analyse {selected.size} selected
            </button>
          )}
          <Link href="/upload" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
            Upload new
          </Link>
        </div>
      </div>

      <main className="px-8 py-6">
        {/* Loading */}
        {loadState === "loading" && (
          <div className="flex flex-col gap-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-800" />
            ))}
          </div>
        )}

        {/* Error */}
        {loadState === "error" && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 px-6 py-5">
            <p className="text-sm text-red-300">Failed to load statements.</p>
          </div>
        )}

        {/* Empty */}
        {loadState === "ready" && statements.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="text-zinc-400">No saved statements yet.</p>
            <Link
              href="/upload"
              className="rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
            >
              Upload a statement
            </Link>
          </div>
        )}

        {/* List */}
        {loadState === "ready" && statements.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Select-all row */}
            <div className="flex items-center gap-3 px-1">
              <input
                type="checkbox"
                checked={selected.size === statements.length}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-zinc-600 accent-blue-600"
                aria-label="Select all"
              />
              <span className="text-xs text-zinc-500">
                {statements.length} statement{statements.length !== 1 ? "s" : ""}
                {selected.size > 0 && ` · ${selected.size} selected`}
              </span>
            </div>

            {statements.map((s) => (
              <div
                key={s.id}
                className={[
                  "flex items-center gap-4 rounded-xl border bg-zinc-900 px-5 py-4 shadow-zinc-900 transition-colors",
                  selected.has(s.id) ? "border-blue-700 ring-1 ring-blue-800" : "border-zinc-800",
                ].join(" ")}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  className="h-4 w-4 flex-shrink-0 rounded border-zinc-600 accent-blue-600"
                  aria-label={`Select ${s.filename}`}
                />

                {/* PDF icon */}
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-950/50">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.25 2.25H6a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 006 21.75h12A2.25 2.25 0 0020.25 19.5V8.25L14.25 2.25z" />
                  </svg>
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{s.filename}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(s.uploadedAt).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {s.numPages ? ` · ${s.numPages}p` : ""}
                    {` · ${s.redactionCount} redactions`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/analyse?ids=${s.id}`)}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
                  >
                    Analyse
                  </button>
                  <button
                    onClick={() => deleteStatement(s.id)}
                    disabled={deleting.has(s.id)}
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-red-950/50 hover:text-red-400 disabled:opacity-40"
                    aria-label="Delete statement"
                  >
                    {deleting.has(s.id) ? (
                      <span className="h-4 w-4 block animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
