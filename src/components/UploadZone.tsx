"use client";

import { useRef, useState } from "react";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFiles, disabled = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (pdfs.length > 0) onFiles(pdfs);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }

  function onClick() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload PDF files"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors",
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200">
        <svg
          className="h-6 w-6 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700">
          Drop PDF statements here, or click to browse
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          CIBC bank and credit card PDFs — multiple files supported
        </p>
      </div>
    </div>
  );
}
