# Curated component alternatives — Keystream stack

Stack assumptions: macOS-only Apple Silicon, Tauri 2, Next.js 16 (App Router, static export), React 19, TypeScript strict, Tailwind 4. Anything that doesn't compose with `dynamic({ ssr: false })` or that requires a server runtime is out — note it in the entry.

This file is the **lookup table**, not a recommendation. The audit's job is to map a *component with 2+ signals firing* to *the right entry here*. Don't suggest swaps for components that aren't firing — the alternatives only help if the build is actually painful.

Last reviewed: 2026-04-30. Refresh quarterly or when a new option enters the ecosystem.

## Code editors / text panels

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **CodeMirror 6** | ~50 KB core + 5–15 KB per language | Very active (used by Replit, Sourcegraph, Jupyter Lab) | Plain-text or code display with line numbers, gutters, syntax highlighting, soft-wrap, virtualized scroll, find/replace. **Likely match for `text-panel.tsx` if it ever fires.** |
| Monaco | ~2 MB gzipped | Active (Microsoft, powers VSCode) | Full IDE-shaped editing (intellisense, multi-tab, diagnostics). Overkill for our use case — we display + lock + send, we don't author IDE-style. |
| Lexical (Meta) | ~50 KB | Active | Rich-text editing (Notion-style). Wrong shape for us — our content is plain code text. |

**CodeMirror 6 integration notes for our stack:**
- React + Next.js: mount inside `useEffect` in a component loaded with `dynamic({ ssr: false })`. Same pattern we already use for `<TextPanel>`.
- Active-line scanline (current Q14/Q16 behavior) maps to `Decoration.line({ class })` driven by a `StateField` listening to reducer's `charsTyped`.
- Wrap toggle (current Q21 behavior) maps to `Compartment.reconfigure(EditorView.lineWrapping)`.
- Read-only / lock mode: `EditorState.readOnly.of(true)`. Replaces our hand-rolled `EditView` / `LockedView` split.
- Language autodetection: extend `classifyIcon` in `src/lib/core/file-tree.ts` with a sibling `pickLanguage(name)` that returns the matching `@codemirror/lang-*` extension.
- Optional convenience wrapper: `@uiw/react-codemirror` saves ~30 lines of mount/unmount boilerplate. Optional, not required.

## File tree / folder explorer

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-arborist** | ~25 KB | Active | Virtualized tree with keyboard nav, drag-drop, multi-select, headless styling. Right call when scaling beyond ~500 nodes/folder, or when adding drag-drop / multi-select to the explorer. |
| react-complex-tree | ~30 KB | Active | More feature-rich, more opinionated. Heavier integration cost. |
| Hand-rolled (current) | 0 | n/a | Right call now: we cap at 500 nodes/folder, no drag-drop, no multi-select, ~250 lines, working. Swap only if those caps lift or 2+ signals fire. |

## Headless UI primitives (buttons, dialogs, dropdowns, tooltips, etc.)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **shadcn/ui** | Per-component (copy-paste) | Active | Add a new primitive that has off-the-shelf shape (Tooltip, DropdownMenu, Sheet, Popover, etc.). Wraps Radix UI; copy-paste source into your repo so you control styling fully. **Default choice for any new primitive.** |
| **Radix UI** | ~5–15 KB per primitive | Active | Behavior-only (no styling). Use directly when shadcn/ui doesn't have what you need or you want zero abstraction. |
| **react-aria** (Adobe) | ~10–25 KB per hook | Active | Accessibility-first hooks. Highest a11y quality bar; heavier API. Reach for when shadcn + Radix aren't enough. |

**Heuristic:** if the new primitive has a name (Tooltip, Popover, Slider, Toggle, ToggleGroup, Sheet, Tabs, Dialog), reach for shadcn first. Don't hand-roll it.

## Drag-resize / pane-split

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-resizable-panels** | ~12 KB | Active | Multi-pane resize with collapsing, min/max constraints, keyboard support. |
| Hand-rolled (current `<ResizeHandle>`) | 0 | n/a | Right call now: ~100 lines, single-pane resize, persisted to settings, working. Swap only if we add a 2nd pane or 2+ signals fire. |

## Forms / inputs

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-hook-form** + zod | ~30 KB combined | Active | Multi-field forms with validation. Settings tabs are simple enough that current bespoke `<NumberInput>` / `<Checkbox>` work; reach for this when forms grow beyond ~5 fields with cross-field validation. |

## Icons

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **lucide-react** (current) | ~3 KB per icon (tree-shaken) | Very active | Keep. Wide coverage, tree-shakeable, matches the project's outline-icon aesthetic. |

## Toasts / notifications

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **sonner** | ~6 KB | Active | If we ever need a toast/notification system. Dead simple integration. We don't have one yet. |

## Charts / data viz

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **recharts** | ~80 KB | Active | If we ever ship dashboards (sender stats, send-history graphs). Out of scope for v2; flag as future. |

## Tauri / OS integration

| Plugin | Maintenance | Use when |
|---|---|---|
| **tauri-plugin-updater** (current) | Official | Already in use as of v0.1.3. |
| **tauri-plugin-process** (current) | Official | Already in use (relaunch after install). |
| **tauri-plugin-dialog** (current) | Official | Already in use. |
| **tauri-plugin-log** (currently unused, in Cargo) | Official | We have a custom JsonFileLogger; consider swap if logging hardening (rotation, structured fields, panic capture — see design-plan.md "Future work") becomes blocking. |
| tauri-plugin-global-shortcut | Official | If D-01 (global hotkeys for Pause/Stop while RDP has focus) ever fires. Currently deferred. |
| tauri-plugin-fs-watch | Official | If Q18's "no live filesystem watcher" decision is ever revisited. Currently deferred. |
| tauri-plugin-autostart | Official | If we add launch-on-login. Not on roadmap. |

## Markdown / rich text rendering (display, not editing)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-markdown** + remark | ~25 KB | Active | If we ever render formatted release notes inside the app (currently the About tab links out to GitHub release pages). Not blocking.|

## Date / time

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **date-fns** | ~3 KB per function (tree-shaken) | Active | If we ever surface elapsed-time formatting beyond what `computeStatusText` handles. Native `Intl` is fine for now. |

## State management

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| Hand-rolled `useReducer` (current) | 0 | n/a | Keep. App-state machine is small and Q14-anchored. |
| **zustand** | ~3 KB | Active | If state grows past ~5 reducers and prop-drilling becomes the issue. Not the case yet. |

---

## What's deliberately not on this list

- **Form libraries** beyond react-hook-form (Formik, Final Form): redundant.
- **CSS-in-JS** (styled-components, Emotion): we use Tailwind; don't add a parallel system.
- **Animation libraries** (Framer Motion, react-spring): our animations are CSS-only and that's working. Reach for these only if motion becomes a feature, not decoration.
- **i18n** (react-intl, i18next): single-locale (English) by design.
- **Routing** (TanStack Router, React Router): Next.js App Router handles this; don't add a parallel.
