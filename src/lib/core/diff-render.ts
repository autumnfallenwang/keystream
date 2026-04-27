// Pure char-level diff rendering for the fail-chunk diff UI (task 40).
//
// Positional zip — not LCS. The fold table in typer-core/src/fold.rs
// already collapses OCR confusions before compute_diff, so what reaches
// the user as "Mismatch" is real character-level disagreement; a simple
// per-position highlight is enough for visual feedback.

export type CharSpan = { kind: "same" | "diff" | "extra"; text: string };

type Kind = CharSpan["kind"];

/**
 * Char-by-char diff between two strings, returning collapsed spans per
 * side. Trailing chars on the longer side become `kind: "extra"`.
 */
export function charDiffSpans(sent: string, seen: string): { sent: CharSpan[]; seen: CharSpan[] } {
  const sentArr = Array.from(sent);
  const seenArr = Array.from(seen);
  const min = Math.min(sentArr.length, seenArr.length);

  const sentSpans: CharSpan[] = [];
  const seenSpans: CharSpan[] = [];

  const pushChar = (spans: CharSpan[], kind: Kind, ch: string) => {
    const last = spans[spans.length - 1];
    if (last !== undefined && last.kind === kind) {
      last.text += ch;
    } else {
      spans.push({ kind, text: ch });
    }
  };

  for (let i = 0; i < min; i++) {
    const a = sentArr[i] as string;
    const b = seenArr[i] as string;
    const kind: Kind = a === b ? "same" : "diff";
    pushChar(sentSpans, kind, a);
    pushChar(seenSpans, kind, b);
  }
  for (let i = min; i < sentArr.length; i++) {
    pushChar(sentSpans, "extra", sentArr[i] as string);
  }
  for (let i = min; i < seenArr.length; i++) {
    pushChar(seenSpans, "extra", seenArr[i] as string);
  }

  return { sent: sentSpans, seen: seenSpans };
}
