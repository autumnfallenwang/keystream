// Pure helper: which line is currently being typed?
//
// Given the source `text` and `charsTyped` so far, return the 0-indexed
// line that contains the next char to be typed. Used by the text panel
// to draw the active-line indicator (Q14: scanline + accent tint).

/**
 * Returns the 0-indexed line of the next char to type. If `charsTyped`
 * exceeds the text length (e.g. after a Completed exit), returns the
 * last line index. Empty text returns 0.
 *
 * Caveat: indexes by JavaScript char code units (UTF-16). The backend
 * iterates Unicode scalars so for BMP-only text these align; non-BMP
 * chars (rare in code) shift the index. Acceptable approximation for
 * the active-line indicator UX.
 */
export function activeLineIndex(text: string, charsTyped: number): number {
  if (text.length === 0) return 0;
  const cap = Math.min(charsTyped, text.length);
  let line = 0;
  for (let i = 0; i < cap; i++) {
    if (text.charCodeAt(i) === 10) {
      // '\n'
      line++;
    }
  }
  return line;
}
