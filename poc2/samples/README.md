# poc2 samples

| Sample | Lines | Purpose |
|---|---|---|
| `shift_heavy.txt` | 10 | Realistic-looking JS-ish lines, every line uses ≥2 shifted chars (uppercase letters, parens, braces, colons, equals, dollar). Exercises the typical mix that triggered live-AVD failures. |
| `delimiters.txt` | 10 | Adjacent shift-drop pairs (`()`, `{}`, `:;`, `"'`, `<>`, `?/`, `+=`, `_-`, `~``, `[]`). If shift-drops happen, they show up here as the unshifted member of each pair appearing where the shifted one was sent. |
| `../docs/poc/samples/code_corpus.txt` | 29 | (existing) Realistic mixed code — what the live-AVD smoke uses. Re-used as the "baseline mixed" sample. |

## Why two new samples

`shift_heavy.txt` keeps line length under 80 chars (Q8) so the line-length
gate doesn't trip during the chunked send experiments.

`delimiters.txt` is deliberately structurally homogeneous — if a sample line
is 20 `(` chars and OCR sees 3 `9`s, that's 3 shift-drops, not OCR confusion
(the rest of the chars are identical, so any visual lookalike applies
uniformly across the line). This makes manual inspection trivial.

## Not committed

Real-world content from a user's actual work session. Stays in `sandbox/`
or `poc2/results/` (both gitignored).
