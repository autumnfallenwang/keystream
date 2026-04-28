#!/usr/bin/env python3
"""Generate a deterministic 15,000-char stress corpus for poc2.

Output: poc2/samples/stress_15k.txt

The corpus is realistic JS-ish code with heavy use of shifted chars
(uppercase, parens, braces, colons, etc.) — the chars that fail in the
shift-drop pattern we're stress-testing.

Deterministic: same run, same output. Reusable across test runs.
"""

from pathlib import Path

# Base lines (~50-70 chars each). Every shifted char from the
# methods.md table appears multiple times across the set.
BASE_LINES = [
    'function Foo(bar) { return bar.baz(); }',
    'const Q = (x) => ({ key: "value", count: x + 1 });',
    'class Server { listen(port) { this.run(port); } }',
    'if (User && URL && Token) { Authenticate(User, URL, Token); }',
    'const O = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };',
    'function Map(items) { return items.map((x) => x * 2); }',
    'const Re = /^[A-Z][a-z]+\\s+[A-Z][a-z]+$/;',
    'async function Fetch(URL) { return await fetch(URL); }',
    'class Q { Q() { Q(); } static Q() {} }',
    'const Pair = ({ A, B }) => [A, B, A + B, A * B];',
    'const Result = items.filter((x) => x > 0).reduce((a, b) => a + b);',
    'export interface User { id: number; name: string; admin: boolean; }',
    'type Handler<T> = (req: Request<T>) => Promise<Response>;',
    'const greet = (name: string) => `Hello, ${name}!`;',
    'try { JSON.parse(data); } catch (err) { console.error(err); }',
    'const arr = [1, 2, 3].map((n) => n * n).filter((n) => n > 4);',
    'class Logger { log(msg: string) { console.log(`[LOG] ${msg}`); } }',
    'const getUser = async (id: number): Promise<User> => fetch(`/u/${id}`);',
    'if (a === b || c !== d) { throw new Error("Mismatch!"); }',
    'const re = /^([A-Z][a-z]+)\\s+([A-Z][a-z]+)$/;',
    'while (n < MAX) { n++; if (n % 2 === 0) continue; }',
    'const Map<K, V> = { get: (k: K) => V | undefined };',
    'export default function App() { return <div>Hello</div>; }',
    'const Pi = 3.14159; const E = 2.71828; const Phi = 1.61803;',
    'await Promise.all([fetchA(), fetchB(), fetchC()]).then(handleAll);',
]

TARGET_CHARS = 15_000

def main():
    here = Path(__file__).resolve().parent
    out = here.parent / "samples" / "stress_15k.txt"

    lines = []
    char_count = 0
    i = 0
    while char_count < TARGET_CHARS:
        line = BASE_LINES[i % len(BASE_LINES)]
        lines.append(line)
        char_count += len(line) + 1  # +1 for newline
        i += 1

    text = "\n".join(lines) + "\n"
    out.write_text(text)
    print(f"wrote {out}")
    print(f"  lines: {len(lines)}")
    print(f"  chars: {len(text)}")
    print(f"  bytes: {out.stat().st_size}")

if __name__ == "__main__":
    main()
