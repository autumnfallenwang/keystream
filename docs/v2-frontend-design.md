# v2 Frontend Design Brief

Visual design proposal for the v2 Keystream UI. Read alongside the architecture spec in [`design-plan.md`](design-plan.md) (sections "Frontend layout (v2)", Q12, Q13, Q14).

This doc is the design conversation; implementation happens after sign-off.

---

## Aesthetic direction: "Terminal Atelier"

Keystream is a precision instrument. Users are doing serious work — typing sensitive code into VMs where clipboard paste is forbidden — and the app is in their workflow at a high-stakes moment ("did this 15k-char paste land correctly?"). The wrong vibe for this app is friendly-Notion-warmth. The right vibe is **a calibrated tool**: composed, austere, slightly industrial, with one electric accent for action.

**Reference points:** Linear (composed dark UI, restrained palette), JetBrains IDE chrome (mono everywhere, tabular numbers), Things 3 (typographic restraint), HEX & Color tools (precise readouts in mono). Not: Notion's warm grays, Claude Desktop's cream, or any "AI assistant" pastel.

**Core principle:** every pixel should feel like it was placed by someone who weighs grams. No emoji where icons can do, no rounded blobby buttons, no decorative motion. The single dose of personality is the wordmark.

---

## Palette

Dark by default. The app spends most of its life next to a code editor; light mode would be a cold-start violation of context.

```
Backgrounds (dark mode default):
  --bg-canvas:       #0a0a0b     # main canvas (text panel)
  --bg-rail:         #08080a     # sidebar, slightly darker than canvas
  --bg-elevated:     #14141a     # action bar, header
  --bg-hover:        #1c1c25     # hover states on rail items
  --bg-active:       #2a2a36     # active rail item (Current text)

Borders & rules:
  --hairline:        #1f1f28     # 1px borders between regions
  --hairline-soft:   #161620     # subtle dividers within a region
  --hairline-strong: #2a2a36     # only for elevated/important boundaries

Foreground:
  --fg-primary:      #f5f5fa     # main text content
  --fg-secondary:    #b4b4c4     # labels, line numbers in active state
  --fg-tertiary:     #6a6a82     # line numbers, eyebrow labels, version tag
  --fg-quaternary:   #44445c     # disabled, hints

Accent (the SINGLE action color):
  --accent:          #6a86ff     # electric periwinkle — distinctive, not generic blue
  --accent-hover:    #7e98ff
  --accent-press:    #5570e8
  --accent-glow:     #6a86ff20   # transparent for the active-line scanline

Status:
  --ok:              #5cd4a0     # success / ✓ gates / done
  --warn:            #ffb347     # paused state
  --alert:           #ff6a8a     # ✗ gates / errors / stopped
```

I picked **periwinkle (#6a86ff)** specifically because it's not the cliché Linear-purple or Vercel-blue — it sits in the gap between, distinctive, holds up against pure grays. If you hate it I can swap to a desaturated coral (#ff8c6a), a phosphor amber (#ffaa00), or a cyan (#5cc8d4). Pick one bias.

Light mode is a v2-polish task; v2 ships dark-only.

---

## Typography

Three faces. All Geist family is already loaded in `layout.tsx` from v1, so we're not adding network weight unnecessarily.

| Use | Family | Weight | Size | Notes |
|---|---|---|---|---|
| Wordmark "Keystream" | **Fraunces** (variable serif) | 500, optical-size 144 | 18px | The only serif in the entire app. Single hand-set name plate. |
| Body / UI labels | **Geist** | 400 / 500 | 13px | Tightly tracked (-0.005em). |
| Section headers (sidebar eyebrows) | **Geist Mono** | 500 | 10px UPPERCASE | Letterspacing 0.1em. |
| Numerical readouts (counters, progress) | **Geist Mono**, `tabular-nums` | 500 | 13px | Digits don't shift width. |
| Text panel content | **JetBrains Mono** | 400 / 500 | 13px / 1.6 line-height | Standard code editor face — what users actually compare against the source. |
| Line numbers | **JetBrains Mono** | 400 | 11px | Dimmed; current-line line number bumps to `--fg-secondary` + 500. |
| Countdown numerals (3/2/1/GO) | **Fraunces** | 600 | 220px | The one moment of typographic drama. |

Why Fraunces for the wordmark and countdown: it's the only place we want emotional weight. A serif among monos reads as deliberate — not decorative.

Network cost: Fraunces is the new add (Google Fonts variable, ~30KB). JetBrains Mono is also new (~25KB). Acceptable for a desktop app. We can self-host both via `next/font/google` for offline reliability after first launch.

If you'd rather avoid adding fonts: Geist Mono can carry the wordmark and countdown — slightly less distinctive but clean. Tell me if I should drop Fraunces.

---

## Layout — full breakdown

### Window & frame

```
Tauri window:
  min size:    1000 × 700
  default:     1280 × 820
  background:  --bg-canvas
  no native macOS title bar — we render a flat header strip ourselves
  (titlebarStyle: "Hidden", traffic lights inset to align with header)
```

Removing the native title bar lets us own the entire chrome. Traffic lights stay (you don't disable Apple's affordances), they're positioned at top-left of the sidebar where they read as part of the rail.

### Region 1 — Sidebar (260px wide, full height)

```
┌──────────────────────┐
│ ●●●                  │  18px reserved for traffic lights
│                      │  (sidebar background continues behind them)
│  Keystream           │  wordmark, Fraunces 18px, --fg-primary
│                      │  20px below traffic lights
│                      │  16px below wordmark
│                      │
│  DOCUMENT            │  eyebrow, Geist Mono 10px UPPERCASE,
│                      │    --fg-tertiary, 0.1em tracking, 14px below
│  ▣ Current text  •   │  rail item, active state — --bg-active
│  ⊕ Load file…        │  rail item — hover → --bg-hover
│  ⊘ Clear             │  rail item — disabled when text empty
│                      │  20px below
│  HISTORY             │  eyebrow
│  empty hint:         │  Geist 12px, --fg-tertiary, italic, 4px indent:
│  "Sent texts will    │  shows when there's no history yet — turns
│   appear here."      │  into a list of items as the user uses the app
│                      │
│  ⏵ login.sh          │  history item, mono 12px, hover → --bg-hover
│    2.4k chars · 14m  │  metadata line, --fg-tertiary 11px
│                      │
│  (... fills space)   │
│                      │  flex-1 spacer
│                      │
│  ────────────────    │  hairline-soft above footer
│  ⚙ Settings          │  rail item, footer
│  v0.1.0              │  Geist Mono 10px, --fg-quaternary
└──────────────────────┘
```

**Rail item anatomy:**
- 36px row height
- 14px horizontal padding (matches eyebrow indent)
- Icon (16px square) + 10px gap + label (Geist 13px)
- Hover: background → `--bg-hover`, 100ms ease
- Active: background → `--bg-active`, 1px left edge in `--accent` (3px wide, full row height) — the "you're here" mark
- Disabled: `--fg-quaternary` text, no hover response

**Icons** (lucide-react, stroke 1.5):
- `FileText` → Current text
- `Upload` → Load file
- `Trash2` → Clear
- `Settings` → Settings
- `History` items use a `Clock` outline next to the title

**Why custom icons not emoji:** emoji render inconsistently (Notepad emoji ≠ macOS emoji), hard to tint, look toy-ish. Lucide is small, consistent, mono-stroke — fits.

### Region 2 — Main column (fills remaining width)

Three vertical sub-regions: header, body, action bar.

#### 2a. Main header (52px, flush against sidebar's right edge)

```
┌─────────────────────────────────────────────────────────────────┐
│ ✓ Text loaded · 15,017 chars   ✓ Accessibility       Edit │ Lock│
│ \-- gate group, Geist 13px ----/                       \-- toggle/
└─────────────────────────────────────────────────────────────────┘
  18px horizontal padding (canvas inset)
```

**Gate group** (left side):
- Two badges, 24px gap
- ✓ rendered in `--ok`, ✗ in `--alert`, both Geist Mono 11px (the check/cross)
- Label in Geist 13px, `--fg-secondary`
- The detail (`· 15,017 chars`) in `--fg-tertiary` — comma-formatted
- Whole badge clickable; ✗ gates open the remediation flow (System Settings deep-link for permissions; focus the textarea for text)

**During send/pause/done/stopped**, the gate group is hidden and replaced by a status indicator (see "Status line" below — but we render it in the header, not as a separate strip; one less visual region).

**Edit/Lock toggle** (right side):
- Two-segment switch, 28px tall, 6px corner radius
- Both labels visible; the active one has `--bg-active` background + `--fg-primary` text
- Inactive label `--fg-tertiary`
- Click swaps states in 120ms ease
- Disabled (during send/pause): both segments dimmed, no hover
- Keyboard: Tab focusable, Space toggles
- This is the "physical switch" feel — matches Things 3 / Linear's segment pickers

#### 2b. Main body (fills, contains the text panel)

The text panel is the centerpiece. It needs to feel substantial — like real code, not a shrunken textarea.

```
┌─────────────────────────────────────────────────────────────────┐
│   1 │ function Foo(bar) { return bar.baz(); }                  │
│   2 │ const Q = (x) => ({ key: "value", count: x + 1 });       │
│   3 │ class Server { listen(port) { this.run(port); } }        │
│ → 4 │ if (User && URL && Token) { Authenticate(...);} ████░░░░ │ ← active line:
│   5 │ const O = { A: 1, B: 2, C: 3, D: 4 };                    │   --accent
│   6 │ ...                                                       │   left border (2px),
│                                                                  │   tinted bg (8% --accent),
│                                                                  │   gutter "→" caret in --accent
└─────────────────────────────────────────────────────────────────┘
  ↑ gutter (52px)
        ↑ separator (1px hairline-soft)
                ↑ content (JetBrains Mono 13px / 1.6, padding-left 16px)
```

**Text panel zones:**
- **Gutter (52px):** dark `--bg-rail`, line numbers right-aligned, 12px right padding. Current-line gutter has the `→` caret and the line number bumps to `--fg-secondary` weight 500.
- **Content:** monospace, full-bleed horizontal scroll (no hard wrap; horizontal scroll is fine here, the text panel is wide).
- **Active line indicator:**
  - 2px left border in `--accent` (replacing the gutter's right edge)
  - Background tint: `--accent-glow` (`#6a86ff20`)
  - **The scanline:** a thin (1px) horizontal `--accent` line that sweeps from left to right across the active line, completing every 800ms (when sending), CSS `@keyframes` translate. When **paused**, the scanline freezes mid-sweep at whatever phase it was in — visually obvious that things are halted.
  - When done/stopped: indicator clears.
- **Edit mode:** uses a real `<textarea>` styled to match. No active-line indicator (nothing's typing).
- **Locked mode:** `<pre>` with the same monospace styling. Read-only. Mouse-select still works (user can copy text). Hover on a line shows its number bumped slightly — small affordance that the panel is alive but locked.

**Why JetBrains Mono and not Geist Mono for content:** JetBrains Mono has the slightly wider proportions and the distinctive `g`/`a`/`@` shapes that read as "code editor." It signals: this is the bytes you'll send.

**Empty state** (no text loaded):
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│              Drop a file here, or click to load                 │  Geist 14px, --fg-tertiary
│                                                                 │
│              ⌘O · Load file                                     │  Geist Mono 11px,
│                                                                 │    --fg-quaternary,
│                                                                 │    "⌘O" in --fg-tertiary
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
Drag-drop is a future v2-polish. For v2 launch, click anywhere = focus textarea = type/paste.

#### 2c. Action bar (sticky, 72px, gradient-faded into body above)

```
                                              gradient fade from --bg-canvas (transparent)
                                              to --bg-elevated over a 20px overlap above this region
┌─────────────────────────────────────────────────────────────────┐
│  Typing 4,521 / 15,017  ·  18.4s  ·  ⏵ paused at line 87       │  status line (28px),
│                                                                 │  Geist Mono 12px,
│                                                                 │  --fg-secondary,
│                                                                 │  --bg-elevated background
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│            ┌───────────────────┐    ┌──────────────┐           │
│            │   ▶  Send         │    │  ⏹  Stop    │           │
│            └───────────────────┘    └──────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                               ↑ buttons centered in main column
                                 ↑ 16px gap between buttons
```

**Status line:**
- Only visible when `sending || paused || hasJustCompleted || hasJustStopped`
- Holds: `Typing 4,521 / 15,017 · 18.4s · ⏵ paused at line 87` style
- Mono, tabular-nums for the digits
- Smooth fade-in (200ms) when send begins
- Done message lingers 2.5s then fades; stopped message lingers until next Send

**Action bar:**
- 72px tall, `--bg-elevated`, 1px top border in `--hairline-strong`
- Buttons centered (or right-aligned — see open questions)
- Two buttons, never more, never fewer

**Primary button (Send/Pause/Resume):**
- 44px tall, Geist 14px medium
- Idle / done / stopped: `▶  Send` — `--accent` background, white text, slight inset shadow on press
- Sending: `⏸  Pause` — `--warn` background (amber)
- Paused: `▶  Resume` — `--accent` background
- Disabled: `--bg-active` background, `--fg-quaternary` text
- Width adapts to content (min 140px) — buttons feel proportional
- Keyboard: Enter (when focused), Space (when focused)

**Secondary button (Stop):**
- Same height, ghosted style
- `--bg-elevated` background, 1px border `--hairline-strong`, text `--fg-secondary`
- Active (during send/pause): border becomes `--alert`, text `--alert`
- Disabled (idle/done/stopped): `--fg-quaternary` text, no border highlight
- Click during send → confirmation? (Open question — see below)

**Why centered buttons:** the main column is wide, two buttons floating right would look stranded. Centered reads as "this is the moment of action." Linear and Things both center primary actions in this kind of footer.

### Region 3 — Countdown overlay (fullscreen, only visible during pre-send/pre-resume)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  background: --bg-canvas at 92% opacity, with 8% gaussian blur  │
│              of the underlying app (frosted glass — Tauri        │
│              supports backdrop-filter on macOS)                  │
│                                                                 │
│                                                                 │
│                                                                 │
│                            ╭─────╮                              │
│                            │     │                              │  circular ring,
│                            │  3  │                              │  220px diameter,
│                            │     │                              │  3px stroke
│                            ╰─────╯                              │  --accent ring fills clockwise
│                              ↑                                  │  (3s total)
│                            Fraunces 600 220px                   │
│                            --accent                             │
│                                                                 │
│                  Click into the AVD window now                  │  Geist 14px,
│                                                                 │  --fg-secondary
│                                                                 │
│                          [ Cancel ]                             │  ghost button,
│                                                                 │  60px below
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- The number transitions: scale 1.05 → 1.0 ease over 200ms on each tick
- "GO" replaces the number at 0, ring completes, then full overlay fades out (300ms) as typing begins
- Esc cancels. Cancel button cancels. No other dismiss path.
- **Resume countdown is identical** — Q14 says re-focus the AVD; the countdown gives that affordance.

### Region 4 — Settings page (replaces text panel when open)

When `⚙ Settings` is clicked in the sidebar, the main column body swaps from text panel to settings (sidebar stays). Header now shows `← Back to text` on the left, `Settings` as the right-side label.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to text                                       Settings  │  header (replaces gates)
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   TIMING                                                        │  eyebrow
│                                                                 │
│   Event pause           ▼              10 ms                    │  label, slider, value (mono)
│   ────●────────────────────                                     │  custom slider
│   Floor 7ms (AVD) · 5ms (local)                                 │  helper, --fg-tertiary 11px
│                                                                 │
│   Modifier hold         ▼              10 ms                    │
│   ────●────────────────────                                     │
│                                                                 │
│   COUNTDOWN                                                     │
│                                                                 │
│   Pre-send seconds      ▼              3 s                      │
│   ──●──────────────────────                                     │
│                                                                 │
│   ADVANCED                                                      │
│                                                                 │
│   ☑ Shift warmup                                                │  checkbox
│   Sends a dummy shift press during countdown to stabilize      │  helper
│   modifier state. Recommended on.                               │
│                                                                 │
│                                                                 │
│   ───────────────────────                                       │  hairline
│   [ Reset to defaults ]                                         │  ghost button
│                                                                 │
│   v0.1.0 · poc2 validated 2026-04-28                            │  Geist Mono 10px,
│                                                                 │    --fg-quaternary
└─────────────────────────────────────────────────────────────────┘
```

- No Save button — values persist on change (debounced 300ms write)
- Slider track is a 2px hairline; thumb is a 14px circle in `--accent` with 1px border
- All values render in mono with units (10 ms, 3 s) — calibrated tool feel
- Reset to defaults: confirmation? (Open question)

---

## State machine (what the UI tracks)

The frontend state model collapses Q14's app states down to a single discriminated union:

```ts
type AppState =
  | { mode: "idle" }
  | { mode: "sending"; charsTyped: number; totalChars: number; elapsedMs: number }
  | { mode: "paused"; charsTyped: number; totalChars: number; elapsedMs: number; pausedLineIdx: number }
  | { mode: "stopped"; charsTyped: number; totalChars: number; elapsedMs: number }
  | { mode: "done"; totalChars: number; elapsedMs: number }
  | { mode: "countdown"; remaining: number; intent: "send" | "resume"; resumeOffset?: number }
  | { mode: "settings" };
```

Driving rules:
- `idle` is the default. Edits the text. Send button enabled iff gates pass.
- `idle → countdown(intent="send")` on Send click.
- `countdown(remaining=0) → sending` automatically (and the IPC send fires).
- `sending → paused` on Pause click (or → `done` on completion, or → `stopped` on Stop).
- `paused → countdown(intent="resume", resumeOffset=charsTyped)` on Resume click.
- `paused → stopped` on Stop click.
- `done`, `stopped` transition back to `idle` (after 2.5s for done, immediately on next interaction for stopped).
- Settings is a "modal" mode — can be entered from `idle` only (back button returns to `idle`).

---

## Distinctive moves (what makes it memorable)

These are the 5 things a returning user notices:

1. **The wordmark.** A single serif name in a sea of mono. Not decorative — a maker's mark on an instrument.
2. **Tabular numerals everywhere.** Char counts, time elapsed, version, settings values. The app feels calibrated; numbers don't dance.
3. **The active-line scanline.** Not a stationary border. A 1px sweep that traces the line as we type. Pauses freeze it mid-sweep — the visual stop is unmistakable.
4. **The Edit/Lock segmented switch.** Not a toggle button. A physical-feeling 2-state slider. Reads as "mode."
5. **Countdown ring + Fraunces numerals.** The one moment of theatre. Big serif number, accent ring fills clockwise, frosted glass behind. Feels like committing to a take.

---

## Locked answers (2026-04-28)

User signed off with "your suggestions are fine" — defaults locked:

1. **Accent: periwinkle `#6a86ff`.**
2. **Fraunces:** add. Wordmark + countdown numerals.
3. **Action bar:** centered.
4. **Stop:** immediate (no confirm) during sending; immediate during paused.
5. **History sidebar:** populated section with empty hint message.
6. **Native title bar:** removed (Tauri `titlebarStyle: "Hidden"`); traffic lights inset into sidebar top.
7. **Settings:** page replacement (main column swaps content, sidebar stays).

---

## What this design explicitly is NOT

- It's NOT a polished v1 (we removed too many features for that)
- It's NOT a "modern AI app" — no warm gradients, no avatar bubbles, no soft corners
- It's NOT brutalist — the typography is too refined, the spacing too considered
- It's NOT terminal-emulator (no scanline overlay on everything, no monospace-only chrome) — we use mono surgically, not maximally

---

## Implementation plan (after sign-off)

When you approve this design, I'll work in this order:

1. **Theme tokens** — `globals.css`, font loading in `layout.tsx`, Tailwind 4 `@theme` directives for the palette
2. **Sidebar component** — `sidebar.tsx` with rail items, sections, eyebrow labels, footer
3. **Main header** — `main-header.tsx` with gate badges + Edit/Lock segmented switch
4. **Text panel** — rewrite `text-panel.tsx` for the simpler v2 model (no chunks, just active-line indicator)
5. **Action bar** — `action-bar.tsx` with status line + primary/secondary buttons
6. **Countdown overlay** — rewrite `countdown-overlay.tsx` with ring + Fraunces numeral + frosted glass
7. **Settings page** — new `settings-page.tsx` in main-area
8. **Page composition** — rewrite `page.tsx` with the new state machine
9. **Tests** — replace v1 tests for the v2 surface (gates, action bar, countdown, settings persistence)

Estimated implementation: 2-3 hours of focused work. Not blocked on backend changes — the IPC layer keeps using v1 calls until phases v2-2/v2-3 land, with a thin adapter that maps v1 events to v2 state transitions.

---

Reply with answers to the open questions (or just "go" if my defaults are fine) and I'll start implementing.
