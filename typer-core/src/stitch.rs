//! Chunk stitching for multi-viewport OCR. Given overlapping OCR chunks
//! captured after PageDown-through-file, find the tail/head overlap and
//! drop the overlap from the next chunk.

use crate::align::lines_similar;
use crate::fold::fold_line;

/// Considered equivalent when their last ~5 lines match under the
/// similarity rule — i.e. the bottom of the viewport didn't change, we've
/// hit the end of the document.
pub fn chunks_equivalent(a: &[String], b: &[String]) -> bool {
    let k = 5.min(a.len()).min(b.len());
    if k == 0 {
        return a.is_empty() && b.is_empty();
    }
    let a_tail = &a[a.len() - k..];
    let b_tail = &b[b.len() - k..];
    a_tail
        .iter()
        .zip(b_tail.iter())
        .all(|(x, y)| lines_similar(&fold_line(x), &fold_line(y)))
}

/// Stitch chunks by finding the longest overlap between the tail of the
/// accumulated result and the head of the next chunk, then appending only
/// the non-overlapping part.
pub fn stitch_chunks(chunks: &[Vec<String>]) -> Vec<String> {
    if chunks.is_empty() {
        return Vec::new();
    }
    let mut acc: Vec<String> = chunks[0].clone();
    for next in chunks.iter().skip(1) {
        let overlap = find_overlap(&acc, next);
        acc.extend(next.iter().skip(overlap).cloned());
    }
    acc
}

/// Returns the length k such that `acc[acc.len()-k..]` matches `next[..k]`
/// under the similarity rule. Prefers larger k. Requires k >= 3 to avoid
/// random short matches (`};`, `}`, ``) aligning spuriously.
pub fn find_overlap(acc: &[String], next: &[String]) -> usize {
    let max_k = acc.len().min(next.len()).min(40);
    for k in (3..=max_k).rev() {
        let tail = &acc[acc.len() - k..];
        let head = &next[..k];
        let ok = tail
            .iter()
            .zip(head.iter())
            .all(|(a, b)| lines_similar(&fold_line(a), &fold_line(b)));
        if ok {
            return k;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(lines: &[&str]) -> Vec<String> {
        lines.iter().map(|l| l.to_string()).collect()
    }

    #[test]
    fn finds_3_line_overlap() {
        // Use distinct content per line so the >=70% fuzzy similarity rule
        // doesn't over-match across the boundary. Realistic OCR'd code has
        // this property because lines are usually not self-similar.
        let acc = s(&["alpha", "bravo", "charlie", "delta", "echo"]);
        let next = s(&["charlie", "delta", "echo", "foxtrot", "golf"]);
        assert_eq!(find_overlap(&acc, &next), 3);
    }

    #[test]
    fn ignores_short_overlap_under_k3() {
        // Only 2-line overlap — below the k>=3 floor, so should report 0.
        // Using single-char strings also avoids fuzzy over-match.
        let acc = s(&["alpha", "bravo", "charlie"]);
        let next = s(&["bravo", "charlie", "delta"]);
        assert_eq!(find_overlap(&acc, &next), 0);
    }

    #[test]
    fn stitch_two_overlapping_chunks() {
        let chunks = vec![
            s(&["alpha", "bravo", "charlie", "delta", "echo"]),
            s(&["charlie", "delta", "echo", "foxtrot", "golf"]),
        ];
        let out = stitch_chunks(&chunks);
        assert_eq!(
            out,
            s(&["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"])
        );
    }

    #[test]
    fn stitch_empty_returns_empty() {
        let chunks: Vec<Vec<String>> = vec![];
        assert!(stitch_chunks(&chunks).is_empty());
    }

    #[test]
    fn chunks_equivalent_detects_stalled_viewport() {
        let a = s(&["l1", "l2", "l3", "l4", "l5"]);
        let b = a.clone();
        assert!(chunks_equivalent(&a, &b));
    }

    #[test]
    fn chunks_not_equivalent_when_viewport_moved() {
        let a = s(&["l1", "l2", "l3", "l4", "l5"]);
        let b = s(&["l2", "l3", "l4", "l5", "l6"]);
        assert!(!chunks_equivalent(&a, &b));
    }

    /// Three overlapping "viewport" chunks derived from the PoC sample
    /// corpus stitch back to the original normalized lines. Exercises
    /// `find_overlap` + `stitch_chunks` against realistic content with
    /// well-above-k=3 overlaps at each boundary. Covers
    /// rules/testing.md invariant #3.
    #[test]
    fn stitch_three_overlapping_corpus_chunks_reconstructs_original() {
        let corpus = include_str!("../../docs/poc/samples/code_corpus.txt");

        // Same normalization compute_diff / run_scroll_verify uses.
        let normalized: Vec<String> = corpus
            .lines()
            .map(|l| l.trim_start().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        assert_eq!(normalized.len(), 29, "corpus normalized length");

        // Simulate 3 viewport captures with 6-line overlap between
        // adjacent chunks (viewport 14, step 8). Matches what
        // scroll-verify produces when PageDown'ing through a 29-line
        // file with a ~14-line viewport.
        let c0: Vec<String> = normalized[0..14].to_vec();
        let c1: Vec<String> = normalized[8..22].to_vec();
        let c2: Vec<String> = normalized[16..29].to_vec();

        assert_eq!(c0.len(), 14);
        assert_eq!(c1.len(), 14);
        assert_eq!(c2.len(), 13);

        let stitched = stitch_chunks(&[c0, c1, c2]);

        assert_eq!(stitched.len(), 29, "stitched length matches original");
        assert_eq!(stitched, normalized, "stitched content matches original");
    }
}
