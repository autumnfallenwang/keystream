"use client";

// Q20 — Non-blocking warning view shown in place of the text panel
// when the user clicks a file that isn't valid UTF-8 (or exceeds the
// 1 MiB cap). Mirrors VSCode's behaviour: the file is acknowledged,
// the previously-loaded content stays in memory, and the user can
// click "← Back" to restore it.

import { ArrowLeft, FileWarning } from "lucide-react";

export type BinaryFileWarningProps = {
  /** Display name (basename) of the file the user clicked. */
  filename: string;
  /** The error string from `read_text_file`. We surface this verbatim
   * but underneath a friendlier headline. */
  reason: string;
  /** Restore the previously-loaded text state. */
  onBack: () => void;
};

export function BinaryFileWarning({ filename, reason, onBack }: BinaryFileWarningProps) {
  // Heuristic for the headline: UTF-8 errors → "binary file"; size
  // errors → "too large"; everything else → generic "couldn't open".
  const isUtf8Error = reason.toLowerCase().includes("utf-8");
  const isSizeError = reason.toLowerCase().includes("too large");
  let headline: string;
  let detail: string;
  if (isUtf8Error) {
    headline = "This file is not a text file.";
    detail = "It looks like a binary file — Keystream only displays UTF-8 text.";
  } else if (isSizeError) {
    headline = "This file is too large to open.";
    detail =
      "Keystream caps text-file loading at 1 MiB. Open a smaller file or split it externally.";
  } else {
    headline = "Keystream couldn't open this file.";
    detail = reason;
  }

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-12"
      data-testid="binary-file-warning"
    >
      <FileWarning size={48} className="text-fg-quaternary" />
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[14px] font-medium text-fg">{headline}</p>
        <p
          className="font-mono text-[12px] text-fg-tertiary"
          data-testid="binary-file-warning-name"
        >
          {filename}
        </p>
      </div>
      <p className="max-w-[480px] text-center text-[13px] text-fg-secondary">{detail}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 flex items-center gap-2 rounded-md border border-hairline bg-bg-elevated px-3 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg"
      >
        <ArrowLeft size={14} />
        Back
      </button>
    </div>
  );
}
