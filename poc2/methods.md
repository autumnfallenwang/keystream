# Typing methods survey for Keystream

Goal: find a keystroke-injection method that doesn't drop shift modifiers.
Context: see [`docs/v2-direction.md`](../docs/v2-direction.md) and
[`poc2/README.md`](README.md).

## TL;DR

- Our current recipe (CGEvent + `kCGSessionEventTap` + NULL source +
  shift-keycode keyDown/keyUp around the char, no `CGEventFlags`) is **the
  cliclick recipe verbatim**. cliclick uses exactly this. KeePassXC
  deliberately does the *opposite* (it uses `CGEventSetFlags` with a single
  combined event). Hammerspoon's bulk-text path uses a third approach
  (`CGEventKeyboardSetUnicodeString` + `kCGHIDEventTap` + flags=0).
- The single most-cited macOS lore: **`CGEventPost` does NOT maintain
  modifier state across separate events** the way a physical key does. A
  shift-keycode keyDown is auto-released as soon as a subsequent event
  arrives without the shift flag. That's the documented "limitation" people
  hit. We're injecting our shift correctly per cliclick, but the OS / event
  pipeline can still re-order or coalesce them, especially under load.
- The **highest-leverage thing to test next** is the same code path with
  `CGEventSetFlags(event, kCGEventFlagMaskShift)` set on the *char* event
  itself (not separate shift events). That's the KeePassXC + auto-type-blog
  approach and what most newer Rust libs do. It collapses three events
  (shift-down, char-down/up, shift-up) into one event with a flag — no
  ordering window for shift to drop.
- For RDP/AVD targets specifically, the **Microsoft Windows App `Scancode`
  vs `Unicode` keyboard mode** is critical context: in Scancode mode (the
  macOS default), the client forwards raw HID scancodes from the local
  keyboard, including a separate shift up/down. So our injected events have
  to look like real key events at the right tap level for the client to
  capture them. `CGEventKeyboardSetUnicodeString` is documented to only work
  in Unicode mode, which is why Notepad shows nothing when we tried that.

## Summary table

| # | Method | Platform | Shift reliability | Speed | RDP target | Maintenance | Recommendation |
|---|---|---|---|---|---|---|---|
| 1 | CGEvent Session-tap, no flags, shift-keycode bracketing (current) | macOS | ~98–99% | Fast | Works (Scancode mode) | Stable Apple API | **Test this against #4 and #2** |
| 2 | CGEvent **HID-tap**, NULL source, no flags | macOS | Untested for us; enigo uses this | Fast | Likely works (lower in stack) | Stable | **Test** — easiest possible change |
| 3 | CGEvent Session-tap, **Private source**, no flags | macOS | Independent modifier table | Fast | Works | Stable | Test in combination with #4 |
| 4 | CGEvent Session-tap, **`CGEventSetFlags(maskShift)`** on char event | macOS | Used by KeePassXC + most Rust libs | Fast | Works | Stable | **Top candidate** |
| 5 | `CGEventKeyboardSetUnicodeString` | macOS | Per-event, no shift state | Fast | **Fails in Scancode-mode RDP** (documented) | Stable | Already ruled out for our target |
| 6 | AppleScript `tell System Events` | macOS | High but slow | ~10× slower | Works | Stable | Fallback only |
| 7 | `TISCopyInputSourceForLanguage` + per-layout keymap | macOS | Improves layout matching, not shift | Fast | Works | Stable | Layout fix, not shift fix |
| 8 | `IOHIDUserDevice` / DriverKit virtual HID | macOS | Highest fidelity (looks like real HID) | Fast | Works (highest level of authenticity) | DriverKit, requires entitlement, root | Heavy; only if 1–4 fail |
| 9 | `xdotool` | Linux X11 | Good on X11, broken on Wayland | Fast | Works | Maintained | Reference only |
| 10 | `ydotool` (uinput) | Linux X11 + Wayland | OK; layout-blind | Fast | Works | Maintained | Cross-platform reference |
| 11 | `libei` + `RemoteDesktop` portal | Linux Wayland | Compositor-managed modifier state | Fast | Works | Active | Modern Wayland path |
| 12 | AT-SPI (a11y) | Linux | App-level, narrow surface | Slow | Often fails | Stable | Not for general typing |
| 13 | `SendInput` (VK) | Windows | Good locally; mode-sensitive in RDP | Fastest | Mode-dependent | Stable | Reference |
| 14 | `SendInput` (scancode) | Windows | More reliable for RDP/games | Fastest | Better than VK in RDP | Stable | Use scancodes if we ever go Windows-host |
| 15 | `keybd_event` | Windows | Deprecated, single-key | Fast | OK | Deprecated | Skip |
| 16 | AHK `SendInput`/`SendEvent`/`SendPlay` | Windows | `SendEvent` adapts to user shift; `SendInput` doesn't | Fast / Fast / Slow | Varies | Active | Reference; `SendEvent` semantics worth borrowing |
| 17 | Win HID injection | Windows | Highest fidelity | Fast | Works | Niche | Heavy; skip |
| 18 | `enigo` | mac/Win/Lin | Mixed history; has open shift bug (#295) | Fast | Varies | Active (0.6.x in 2025) | Don't blindly trust |
| 19 | `rdev` | mac/Win/Lin | Documented 20ms catchup; layout-dependent | Fast | Varies | Lightly maintained | Avoid for our use |
| 20 | `tfc` (The Fat Controller) | mac/Win/Lin | Lin uinput path is a clean reference | Fast | Varies | Quiet | Skip |
| 21 | `autopilot-rs` | mac/Win/Lin | Older, less active | Fast | Varies | Quiet | Skip |
| 22 | Karabiner-DriverKit-VirtualHIDDevice (client) | macOS | Real HID device — modifiers reliable | Fast | Works | Very active | **Heavy but conceptually the answer** |
| 23 | Apple Events / AX `kAXValueAttribute` | macOS | Bypasses keystroke layer entirely | n/a | Doesn't reach RDP textareas | Stable | Not for our target |

## Top 3 candidates to actually test next

1. **CGEvent Session-tap + `CGEventSetFlags(maskShift)` on the char event,
   no separate shift keyDown/keyUp.** This is the KeePassXC pattern and
   what most macOS auto-type tutorials in 2024–2026 recommend
   ([`AutoTypeMac.cpp`][keepassxc-mac],
   [Igor Kulman blog][kulman]). Rationale: the macOS lore is that
   `CGEventPost` doesn't reliably maintain modifier state *across* events
   (the shift "auto-releases" if the next event lacks the flag —
   [sharmac1odewiki][sharmac]). Setting the flag *on* the char event
   sidesteps that race. Single event = no ordering window. Cheapest possible
   change to `typer-core/src/sender.rs`.

2. **CGEvent HID-tap (`kCGHIDEventTap`) with the current shift-bracket
   recipe.** Posting lower in the stack means the events are seen by the
   window server at the same point a real key press is, including by RDP
   clients which hook the HID tap to forward scancodes to the VM. enigo
   uses HID-tap exclusively. cliclick uses Session-tap (and has the same
   shift-drop reports we have). Pure tap-location swap, one-line change in
   our Rust. ([enigo source][enigo-mac]).

3. **`CGEventSourceStateID::Private` + flags-on-char event** (combine with
   #1). A Private source has its own modifier table independent of system
   state, so user physical keypresses (if any reach the OS during our send)
   can't desynchronize "our" shift. enigo exposes this as
   `independent_of_keyboard_state`. Slightly more complex, but isolates us
   from the user moving the mouse / pressing a key mid-send (the enigo
   issue #201 trap).

If 1+3 combined still drops shift, the next escalation is
**Karabiner-DriverKit-VirtualHIDDevice as a sidecar**: it runs as a
privileged daemon and exposes a virtual HID keyboard that macOS sees as
real hardware. RDP clients hook the HID layer, so a virtual HID device
should produce zero shift drops. Cost: requires the user to install the
DriverKit extension once (system extension prompt), and our app must talk
to its Unix domain socket. That's a meaningful UX hit, so it's only
warranted if the simpler experiments don't close the gap.

## Methods we should NOT pursue

- **`CGEventKeyboardSetUnicodeString` for RDP targets.** Microsoft
  documents that Windows App on macOS defaults to **Scancode mode**, in
  which the local client only forwards key up/down with HID scancodes; the
  unicode-string payload of a CGEvent is invisible at that level. This is
  why our PoC tried it and got nothing in Notepad.
  ([MS Learn — keyboard modes][ms-keyboard-modes]).
  Hammerspoon's bulk text uses this approach but explicitly only for *local*
  apps — note Hammerspoon's `keyStrokes()` posts to `kCGHIDEventTap` with
  `CGEventSetFlags(event, 0)`, intentionally clearing modifiers because it's
  using unicode-payload. Different problem space.

- **`keybd_event` on Windows.** Deprecated since Vista; can't issue
  arbitrary scancodes. Even if we ever target a Windows host, `SendInput`
  is the right choice.

- **AT-SPI on Linux.** App-by-app, brittle, doesn't reach a VM running
  inside (e.g.) RustDesk. Wrong abstraction layer.

- **AppleScript `keystroke` for the hot path.** ~10× slower than CGEvent
  (each keystroke is an AppleEvent round-trip through `osascript`), and the
  Keyboard Maestro / Apple discussion threads show users still hitting the
  same race-conditions we hit with CGEvent. Could survive as a "Reliable
  Mode" toggle for users who'd rather wait, but not the default.

- **Apple Events / `AXUIElementSetAttributeValue(kAXValueAttribute, …)`.**
  Bypasses the keyboard entirely by writing directly to a focused text
  field. Beautiful when it works (zero typing errors by definition), but
  RDP clients render the remote screen as an opaque graphics surface — they
  don't expose the remote text field as an AX element on the host. So this
  approach can't reach a VM textarea. Worth keeping in mind for a future
  "type into a local Mac app" feature, where it'd be strictly better.

- **Wholesale port to `enigo`/`rdev`/`tfc`.** None of them solve the shift
  problem we're seeing — at best they're a different parameterization of
  the same CGEvent calls. enigo issue #295 is literally "shift modifier
  drops on macOS" with no resolution. We can borrow patterns from their
  source but not the dependency.

## Per-method notes

### 1. CGEvent + Session-tap + NULL source + shift-keycode bracketing (current)

How it works: `CGEventCreateKeyboardEvent(NULL, code, true)` for shift-down,
then char-down, char-up, shift-up — each `CGEventPost(kCGSessionEventTap,
e)`. No `CGEventFlags` set on any event. This is exactly the cliclick recipe
([`TypeAction.m`][cliclick-type] uses `nanosleep(10ms)` between events; we
parameterize as `mod_hold_ms`/`event_pause_ms`).

Known issues:

- The macOS event pipeline does *not* hold modifier state across separate
  posted events the way a physical keyboard cable does. Multiple developers
  on the Apple Developer Forums and Mac dev blogs report that a virtually
  pressed shift "is released automatically when the following event doesn't
  contain the shift flag" — i.e. as soon as the char event arrives without
  `kCGEventFlagMaskShift`, the runtime treats shift as released regardless
  of whether we sent the shift-up yet ([sharmac1odewiki][sharmac]).
- Background apps may not receive injected events at all; only the
  foreground app does ([Apple DevForums #73639][apple-73639]).
- `kCGSessionEventTap` is the higher-level tap; events here are *after*
  the window server has annotated them. RDP clients hook `kCGHIDEventTap`,
  so events posted at Session-tap might be visible to the RDP client only
  via the window server's later forwarding, which has its own ordering
  guarantees ([Apple `CGEventTapLocation` docs][apple-tap-loc]).

Reliability for shift: ~98–99% in our PoC against AVD/Notepad
(`docs/v2-direction.md`). Local TextEdit also drops occasionally
(per `poc2/README.md` Q1 in flight).

Speed: roughly 1 char per 10–20 ms with our current `event_pause_ms`/`char_pause_ms`.

### 2. CGEvent + HID-tap + NULL source + shift-keycode bracketing

How it works: identical to #1 but `CGEventPost(kCGHIDEventTap, e)`.

Why HID may help:

- HID-tap is the point in the pipeline "where HID system events enter the
  window server" ([Apple docs][apple-tap-loc]). The window server itself
  consumes events from this tap, then annotates and forwards. Posting here
  is closer to "as if the keyboard cable produced the event."
- enigo posts exclusively to `HIDEventTap`
  ([`macos_impl.rs`][enigo-mac]). Its known macOS issues are around mouse
  movement breaking modifier state (#201) and the historic 20ms sleep
  (#105), not the systematic shift-drop pattern we're seeing.
- RDP clients (Microsoft Remote Desktop, Windows App) capture from the HID
  tap to forward Scancode-mode events to the VM. If our injected events
  are at Session-tap, they may reach the RDP client window via a different
  path than physical keys do.

Risk: HID-tap requires the same Accessibility permission, but some
discussions suggest HID-tap is stricter about the calling process being
the foreground app. We already require Accessibility, so this should be
flat.

Reliability for shift: untested for our use case; this is the highest-EV
single-line experiment.

### 3. CGEvent + `CGEventSourceStateID::Private` source + no flags

How it works: `CGEventSource::new(CGEventSourceStateID::Private)` once,
then `CGEventCreateKeyboardEvent(source, code, …)` — passing the explicit
private source rather than NULL.

Why it might help: a Private source has its own modifier-state table,
disjoint from system state. If the user's physical keyboard is not in a
neutral state (e.g. they're holding a key), or if mouse movement /
caps-lock toggling racing against our injection is what's clearing the
shift bit, a Private source insulates us.
- Apple's docs list three state IDs: `Private`, `CombinedSessionState`
  (system-wide combined view), and `HIDSystemState`
  ([Apple `CGEventSourceStateID`][apple-source-state]).
- enigo exposes this as `independent_of_keyboard_state` —
  `Private` when true, `CombinedSessionState` when false
  ([enigo macos_impl.rs][enigo-mac]). Their default is `Private`, which is
  the opposite of our default-NULL (which is roughly equivalent to
  `CombinedSessionState`).

Pairs naturally with #1, #2, or #4. Cheap to test.

### 4. CGEvent + `CGEventSetFlags(maskShift)` on the char event (NO separate shift events)

How it works:
```
e = CGEventCreateKeyboardEvent(source, charKeyCode, true);
CGEventSetFlags(e, kCGEventFlagMaskShift);
CGEventPost(tap, e);
… same for keyUp …
```
No shift-down, no shift-up. The flag is on the char event itself.

This is what KeePassXC does ([`AutoTypeMac.cpp` `sendKey`][keepassxc-mac]:
`CGEventSetFlags(keyEvent, nativeModifiers); CGEventPost(kCGSessionEventTap, keyEvent);`).
It's also the dominant pattern in macOS auto-type tutorials (Igor Kulman:
*"Apply the flags to the CGEvent object before sending it"*
[blog post][kulman]) and most Rust libs (enigo uses
`add_event_flag()` per char [in macos_impl.rs][enigo-mac]).

Why this likely fixes the shift drop: there's only ONE event for the char,
and it carries the shift flag intrinsically. There's no separate
shift-keyDown event that can be re-ordered with respect to the char event,
and no auto-release race ("the shift was released because the next event
didn't have the flag" — well, the next event *is* the char event and *does*
have the flag). The Apple lore in [sharmac1odewiki][sharmac] is literally
recommending this fix.

Why we explicitly avoided it (per `CLAUDE.md`): "Apple's documented
modifier-flag approach does not survive the RDP hop." That conclusion
came from the Python predecessor PoC in `docs/poc/python-predecessor/`;
worth re-validating, because:
- It was tested against a different RDP client config (likely Unicode
  mode, or via a different tap location).
- KeePassXC, which targets RDP-style use cases on macOS, uses flags and
  is widely deployed.
- The interaction is: flags-on-char + Session-tap might not cross the
  HID boundary cleanly, but flags-on-char + **HID-tap** (combine with #2)
  has a much better chance, since the RDP client hooks HID directly.

This is the **single most important experiment** the survey points to.

### 5. `CGEventKeyboardSetUnicodeString`

How it works: create an empty keyboard event with keycode 0,
`CGEventKeyboardSetUnicodeString(e, 1, &uniChar)` to attach the character
payload, post.

Why it fails for us:

- Microsoft's Windows App for macOS uses **Scancode** keyboard mode by
  default. In Scancode mode the client only forwards "key press up/down
  information" and the *physical position*; the unicode string payload is
  not part of what gets forwarded ([MS Learn][ms-keyboard-modes]).
- Even in **Unicode** mode (which the user has to switch to manually,
  Control+Command+U), there are documented edge cases where Mac unicode
  input gets misinterpreted by the VM.
- KeePassXC uses `CGEventKeyboardSetUnicodeString` for its `sendChar`
  path ([`AutoTypeMac.cpp`][keepassxc-mac]) — works for native macOS
  apps, but those don't include "Notepad inside a Windows App session."

Hammerspoon's bulk-text path is also unicode-string-based but explicitly
clears flags and posts to HID-tap
([`libeventtap.m`][hammerspoon-libeventtap]) — reinforces that
unicode-string is a unicode pipeline, not a scancode pipeline.

Conclusion: don't use for RDP targets. Could be a high-speed path for
local-Mac targets in the future.

### 6. AppleScript `tell application "System Events" to keystroke …`

How it works: AppleEvent round-trip from our process to System Events, which
synthesizes CGEvents internally.

Reliability: high in low-pressure cases, but plenty of forum reports of
the same race conditions we see — characters dropped, wrong case, scripts
sometimes-work-sometimes-don't ([Keyboard Maestro forum][km-applescript],
[Apple Discussions thread 252159592][apple-applescript-slow]). The
common fix in those threads is "add `delay` between keystrokes" — the
same medicine that didn't work for us.

Speed: ~10× slower than direct CGEvent. Each call is an AppleEvent IPC
hop and System Events is single-threaded.

Use case for us: "Reliable Mode" fallback toggle, *if* empirical testing
shows it has materially fewer shift drops than CGEvent. Cheap to add (we
just shell out to `osascript`), but not the default path.

### 7. `TISCopyInputSourceForLanguage` / HIToolbox keymap

How it works: query the active input source's keymap to map characters
to keycodes correctly across keyboard layouts (Dvorak, AZERTY, etc.).

This is a *different* problem from shift drops — it fixes "what keycode
should I press for a `Q` on a French keyboard" (which on AZERTY is
keycode 12, not 0). It doesn't help shift reliability; it just ensures
the keycode lookup is correct. Worth folding in as a v2 robustness
improvement (we currently hardcode US-ANSI mapping per
`docs/v2-direction.md`), but orthogonal to the shift question.

### 8. `IOHIDUserDevice` / DriverKit virtual HID keyboard

How it works: register a virtual HID device with the kernel; macOS sees
it as a real keyboard. Send HID reports and the OS treats them
identically to a USB keyboard's events, including correct modifier state
tracking by the HID stack (which is *the* canonical source of truth for
modifier state).

References: Karabiner-DriverKit-VirtualHIDDevice
([repo][karabiner-vhid]), Apple's HIDDriverKit
([Apple docs][apple-hiddriverkit]), `foohid`
([repo][foohid]) for older kext approach.

Constraints:
- DriverKit System Extension — requires user approval at first launch
  (security prompt), and on Apple Silicon requires Reduced Security mode
  on the Mac (one-time recovery-mode setup). Big UX cost.
- Karabiner's daemon requires root.
- macOS 26.4 beta broke virtual-HID intercepting events from the *built-in*
  MacBook keyboard ([Apple DevForums #817003][apple-vhid-26-4]) — but
  *posting* events from a virtual HID still works.

Reliability: this is conceptually how every password manager that
"just works" handles it on hostile platforms (e.g. KeePass-on-Linux's
KPUInput Wayland plugin uses `/dev/uinput` for the same reason). If
shift drops are a CGEvent-pipeline artifact, virtual-HID injection
sidesteps the entire pipeline. **Strongest upper bound on reliability,
highest UX cost.**

If we go this route, the right shape is: ship a tiny privileged daemon
sidecar that exposes a Unix-domain-socket protocol, and have our Tauri
backend talk to it. The daemon can be the
Karabiner-DriverKit-VirtualHIDDevice client library directly
([client header][karabiner-vhid-client]). This is the "next iteration of
the product" option, not a quick experiment.

### 9. `xdotool` (Linux/X11)

X11 only — uses XTEST extension and Xlib. Will not work on Wayland
([semicomplete blog][xdotool-wayland]). Reference quality reading; not
relevant for our macOS-first roadmap.

### 10. `ydotool` (Linux, X11+Wayland via uinput)

Uses `/dev/uinput` to emulate an input device at the kernel level —
analogous to virtual HID on macOS. Works on both X11 and Wayland because
it sits *below* the display server.

Known issues: layout-blind (sends raw keycodes regardless of user's
layout), incomplete non-ASCII support
([Medium article on Wayland keystrokes][medium-wayland]). Modifier
handling is documented as `KEYCODE:STATE` pairs (`56:1 106:1 106:0 56:0`
for Alt+Right) — sequencing is on you.

### 11. `libei` + RemoteDesktop xdg-portal (Linux Wayland)

Modern Wayland-first approach. The portal grants the app a connection to
an EI server in the compositor; the compositor maintains modifier state on
behalf of the client (libei docs explicitly say "for a pure libei client,
maintaining modifier state is not possible — the modifier state is
maintained by the windowing system" — the compositor handles it correctly,
the client just sends key events
[Phoronix coverage][libei-phoronix]). This is the right long-term Wayland
target, less ad-hoc than ydotool.

### 12. AT-SPI

Wrong layer for our problem. Skip.

### 13. Windows `SendInput` with virtual-key codes

Win32: `SendInput()` with `KEYBDINPUT { wVk = VK_SHIFT, … }`, then
`{ wVk = 'A', … }`. VKs are layout-aware Windows synthetic keycodes.

Issues in RDP/games: VK input "doesn't always make it through" to
DirectInput games and to RDP sessions with raw scancode forwarding
([cplusplus forum][cpp-scancode], [Microsoft Q&A][msq-vk]). Hence the
scancode flag.

### 14. Windows `SendInput` with scancode (`KEYEVENTF_SCANCODE`)

Sends raw HID scancodes, layout-independent. More reliable for RDP and
DirectInput games. Trick: extended keys (right-side modifiers, arrows)
need a 0xE0 prefix scancode. `KEYUP` ORs `KEYEVENTF_KEYUP` with
`KEYEVENTF_SCANCODE`. For modifiers like shift, two separate scancode
events (down for VK_SHIFT, then char, then up) — same shape as our
macOS recipe. We don't have a Windows host today but if we ever do,
**scancode is the right default for RDP.**

### 15. `keybd_event`

Deprecated. Skip.

### 16. AutoHotkey `SendInput` / `SendEvent` / `SendPlay`

Useful as a *semantic* reference even though we don't ship AHK:

- `SendInput` is fastest, atomic, and *cannot adapt* to user-pressed
  modifiers mid-send.
- `SendEvent` is slower but **adapts to modifier state**: "if the modifier
  state changes part-way through the sequence, SendEvent can compensate
  for it… SendEvent will try to release Shift before each character so
  that it continues to produce lowercase letters, whereas SendInput would
  still be executing the original sequence which do not contain a
  Shift-up, so it might result in uppercase letters" ([AHK
  docs][ahk-send]). This is the design we want for v2 if we go down the
  per-event route: re-assert the desired shift state per char, not assume
  the previous shift-down stuck.
- `SendPlay` injects through the Win32 input simulator at a layer that
  some games' anti-cheat ignores. Not relevant for us.
- `SendInput` automatically reverts to `SendEvent` when another script has
  a low-level keyboard hook installed — i.e. it acknowledges the
  fundamental fragility of "synthetic input as a fire-and-forget batch."

### 17. Windows raw HID injection

`HidD_SetOutputReport`, etc. — heavy, requires driver, niche. Skip.

### 18. `enigo` (Rust, mac/Win/Lin)

Active project, currently 0.6.x as of mid-2025
([CHANGES.md][enigo-changes]). macOS implementation (per
[`macos_impl.rs`][enigo-mac]):
- Posts to `HIDEventTap` exclusively.
- Settings switch: `independent_of_keyboard_state` chooses
  `CGEventSourceStateID::Private` vs `CombinedSessionState`.
- Uses both flag-setting (`add_event_flag`) and unicode-string fast path.
- Recent CHANGES say "removed setting and functions related to the delay
  on macOS because a sleep is no longer necessary."

Open issues relevant to us:
- [#295][enigo-295] — special characters with shift broken on macOS
  (closed but appears unresolved per the issue text).
- [#201][enigo-201] — mouse movement interrupts meta-key press (modifier
  desync via physical input).
- [#103][enigo-103] — `key_up` SIGABRT on macOS in release mode.
- [#37][enigo-37] — release-mode timing differs from debug.

Recommendation: don't depend on enigo, but *do* mine
`macos_impl.rs` for the pattern (HID-tap + Private source + flag-on-char).

### 19. `rdev` (Rust, mac/Win/Lin)

Maintained but not actively. Documents a 20ms catchup delay needed on
macOS ([crates.io][rdev-crates]). Layout detection is layout-dependent
and breaks if the user switches layouts mid-session
([rdev docs][rdev-docs]). Listening API is fine; injection has the same
underlying issues. Skip.

### 20. `tfc` (The Fat Controller)

Linux focus. Has a clean `/dev/uinput` reference implementation that's
worth reading if/when we add Linux support. ([crates.io][tfc-crates]).

### 21. `autopilot-rs`

Older, less active. Skip.

### 22. Karabiner-DriverKit-VirtualHIDDevice

See method 8. Architecture
([repo README][karabiner-vhid]):
- Karabiner-VirtualHIDDevice-Daemon (root) talks to the DriverKit driver.
- Client apps connect to the daemon via Unix domain socket (no need for
  pqrs.org code-signing identity).
- The virtual device is recognized by macOS as same as physical hardware.

For us, the integration would be: ship a sidecar daemon (or assume
Karabiner-DriverKit-VirtualHIDDevice is installed), connect over UDS,
send HID keyboard reports. Modifier state is maintained correctly by
macOS's HID stack because the virtual device *is* a HID keyboard from
macOS's POV. **This is the strongest theoretical fix for shift drops at
the cost of significant install friction.**

### 23. AX `kAXValueAttribute` / Apple Events

Bypasses keystroke layer. Only works for native Mac apps that expose AX
text fields. RDP/AVD windows are a single AX element (the remote
display); we cannot reach the VM's textarea. Not viable for our target.
Useful future feature for "type into a local Mac app" mode.

## Why shift drops happen at all — the lore

Distilled from search:

1. **`CGEventPost` does NOT keep modifiers latched between events.** Multiple
   developer threads describe it: a shift-keycode keyDown is implicitly
   released the moment a subsequent event arrives whose flags don't
   include shift. This is a foundational mismatch with how a physical
   keyboard cable behaves (where shift stays asserted until the OS
   actually sees the up-edge). Workaround: put the shift flag *on every
   shifted event*, not on a separate shift-down event.
   ([sharmac1odewiki][sharmac]; reinforced by the Apple Developer Forum
   discussions on background-app injection)

2. **Event ordering at Session-tap is not strictly FIFO with respect to
   the char-down / shift-down pair.** With NULL source (no source object),
   posted events go through a re-ordering step that, under load, can
   place the char before its shift-down. ([CGEvent.h header
   comments][cgevent-header])

3. **Mouse movement, focus changes, and physical keyboard activity all
   touch the same modifier-state table** that injected events read. enigo
   #201 captures this exactly ("mouse movement interrupts the press of
   the meta key").

4. **The 20ms-sleep folklore** in enigo, rdev, AHK SendEvent, etc., is
   all a band-aid for this — give the WindowServer a tick to settle the
   modifier state. We've already proven this isn't the answer for our
   workload (longer holds made things *worse*, per `poc2/README.md`).
   Adding more sleep is treating a symptom.

5. **RDP clients hook the HID tap to capture scancodes for forwarding**,
   so events posted to Session-tap may take a different (slower / lossier)
   path through the WindowServer to reach the RDP client window than
   physical key events do.

## How the most-cited tools actually do it

Concrete data from sources, for the record:

### cliclick ([source][cliclick-type])

```objective-c
// Per-shifted-char loop
if (modifier & MODIFIER_SHIFT) {
    e = CGEventCreateKeyboardEvent(NULL, KEYCODE_SHIFT, true);
    CGEventPost(kCGSessionEventTap, e);  CFRelease(e);
}
nanosleep(10ms);
keyDown = CGEventCreateKeyboardEvent(NULL, keyCode, true);
CGEventPost(kCGSessionEventTap, keyDown);
keyUp   = CGEventCreateKeyboardEvent(NULL, keyCode, false);
CGEventPost(kCGSessionEventTap, keyUp);
nanosleep(10ms);
if (modifier & MODIFIER_SHIFT) {
    e = CGEventCreateKeyboardEvent(NULL, KEYCODE_SHIFT, false);
    CGEventPost(kCGSessionEventTap, e);  CFRelease(e);
}
```
**This is exactly Keystream's recipe.** And cliclick's bug tracker
shows the same first-keystroke-swallowed and shifted-char issues we have.

### KeePassXC ([source][keepassxc-mac])

```cpp
// sendKey: per-char, single event with modifier flags set
CGEventRef keyEvent = CGEventCreateKeyboardEvent(nullptr, keyCode, isKeyDown);
CGEventFlags nativeModifiers = qtToNativeModifiers(modifiers, true);
CGEventSetFlags(keyEvent, nativeModifiers);
CGEventPost(kCGSessionEventTap, keyEvent);
```
**Single event with shift flag, no separate shift events.** This is
candidate #4 in the table above.

### Hammerspoon `keyStrokes` ([source][hammerspoon-libeventtap])

```objective-c
// Bulk text path: unicode payload, HID-tap, flags explicitly cleared
CGEventSetFlags(keyDownEvent, (CGEventFlags)0);  // clear flags
CGEventKeyboardSetUnicodeString(keyDownEvent, 1, &buffer);
CGEventPost(kCGHIDEventTap, keyDownEvent);
```
Fast for native apps, won't reach RDP-Scancode targets. Inverse of #4.

### enigo ([source][enigo-mac])

- Always posts to `kCGHIDEventTap`.
- `CGEventSourceStateID::Private` if `independent_of_keyboard_state`
  (default true), else `CombinedSessionState`.
- For per-key input: `add_event_flag` — flags-on-char approach (#4).
- For text input via `fast_text`: clear flags, use unicode string,
  chunk to 20 chars (`CGEventKeyboardSetUnicodeString` truncates).

## Open questions — needs empirical testing

1. Does **flags-on-char + Session-tap** (KeePassXC literal) drop shifts
   in our local TextEdit / AVD setups? If yes, the macOS lore about
   modifier auto-release is wrong, or there's a different root cause.
2. Does **flags-on-char + HID-tap** (enigo literal) outperform our
   current Session-tap shift-bracket recipe? Hypothesis: yes.
3. Does **shift-bracket + Private source + HID-tap** (incremental change
   from current) outperform current? Lower expected delta than #2.
4. Is the residual ~1% shift-drop rate (assuming we get there) due to
   the **WindowServer dispatching to the RDP client window** or due to
   the **RDP client itself dropping events** under load? Empirically
   distinguishable: type the same payload to a local non-RDP target and
   measure.
5. Could **CGEventPostToPid(rdpClientPID, …)** vs `CGEventPost(tap, …)`
   improve delivery? Targets a specific app; might bypass focus
   races. KeePassXC uses `CGEventPost`, not the per-PID variant; worth
   testing as a tiebreaker.
6. If we still see drops after #1–#4, is **DriverKit-VirtualHID** the
   only bullet left? At what point is the install friction worth it?
7. AHK's `SendEvent` semantics ("re-release modifier mid-batch if user
   physically toggles it") — is there a CGEvent equivalent we should
   replicate by polling `CGEventSourceKeyState(combinedSessionState,
   shiftKeycode)` between chars and re-issuing shift-down if the OS
   thinks shift went up? Worth a small experiment.

---

## Sources

- [cliclick — `Actions/TypeAction.m` (full source via raw GitHub)][cliclick-type]
- [cliclick — `Actions/KeyDownAction.m`][cliclick-keydown]
- [cliclick — `Actions/KeyBaseAction.m` (DeepWiki summary)][cliclick-keybase]
- [KeePassXC — `src/autotype/mac/AutoTypeMac.cpp`][keepassxc-mac]
- [Hammerspoon — `extensions/eventtap/libeventtap.m`][hammerspoon-libeventtap]
- [enigo — `src/macos/macos_impl.rs`][enigo-mac]
- [enigo — CHANGES.md][enigo-changes]
- [enigo issue #295 — Special characters not working with ShiftKey][enigo-295]
- [enigo issue #201 — Mouse movement interrupts meta key][enigo-201]
- [enigo issue #103 — key_up SIGABRT on macOS][enigo-103]
- [enigo issue #37 — key_sequence too fast in release mode][enigo-37]
- [Igor Kulman — Implementing Auto-Type on macOS][kulman]
- [Delphi Haven — Sending virtual keystrokes on OS X][delphihaven]
- [sharmac1odewiki — CGEventPost / hold a key (shift)][sharmac]
- [Apple Dev Forums #73639 — Simulate actual keypresses][apple-73639]
- [Apple `CGEventTapLocation` docs][apple-tap-loc]
- [Apple `CGEventSourceStateID` docs][apple-source-state]
- [Apple `kCGEventFlagMaskShift` docs][apple-flag-shift]
- [Apple HIDDriverKit][apple-hiddriverkit]
- [Apple Dev Forums #817003 — macOS 26.4 beta breaks vHID][apple-vhid-26-4]
- [Karabiner-DriverKit-VirtualHIDDevice repo][karabiner-vhid]
- [Karabiner-VirtualHIDDevice client header][karabiner-vhid-client]
- [foohid — IOKit driver for virtual HID devices][foohid]
- [MS Learn — Use keyboard / Windows App keyboard modes (macOS)][ms-keyboard-modes]
- [Citrix Workspace for Mac — Keyboard][citrix-keyboard]
- [Microsoft Q&A — Virtual key codes not working as expected][msq-vk]
- [cplusplus.com — Keyboard scan codes (SendInput)][cpp-scancode]
- [Michael Davis — Extended scancodes in SendInput][davis-scancodes]
- [AutoHotkey docs — Send / SendInput / SendEvent / SendPlay][ahk-send]
- [xdotool README — known Wayland issues][xdotool-readme]
- [semicomplete — Exploring Wayland fragmentation, an xdotool adventure][xdotool-wayland]
- [ydotool README][ydotool-readme]
- [wtype — xdotool type for Wayland][wtype-mankier]
- [Phoronix — libei 1.0 released][libei-phoronix]
- [Wayland-devel — RFC: libei][libei-rfc]
- [rdev crate page][rdev-crates]
- [rdev docs][rdev-docs]
- [tfc crate page][tfc-crates]
- [Hammerspoon `hs.eventtap` docs][hammerspoon-eventtap-docs]
- [AXUIElementSetAttributeValue Apple docs][apple-ax-set]
- [Keyboard Maestro forum — AppleScript System Events unreliability][km-applescript]
- [Apple Discussions — AppleScript keystroke slower][apple-applescript-slow]
- [Apple Dev Forums #103992 — CGEventPost doesn't work in 10.14][apple-103992]
- [Apple `CGEventCreateKeyboardEvent` docs][apple-cgevent-keyboard]
- [phracker MacOSX-SDKs — `CGEvent.h` headers][cgevent-header]

[cliclick-type]: https://github.com/BlueM/cliclick/blob/master/Actions/TypeAction.m
[cliclick-keydown]: https://github.com/BlueM/cliclick/blob/master/Actions/KeyDownAction.m
[cliclick-keybase]: https://deepwiki.com/BlueM/cliclick/1.2-usage-guide
[keepassxc-mac]: https://github.com/keepassxreboot/keepassxc/blob/develop/src/autotype/mac/AutoTypeMac.cpp
[hammerspoon-libeventtap]: https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/eventtap/libeventtap.m
[enigo-mac]: https://github.com/enigo-rs/enigo/blob/main/src/macos/macos_impl.rs
[enigo-changes]: https://github.com/enigo-rs/enigo/blob/main/CHANGES.md
[enigo-295]: https://github.com/enigo-rs/enigo/issues/295
[enigo-201]: https://github.com/enigo-rs/enigo/issues/201
[enigo-103]: https://github.com/enigo-rs/enigo/issues/103
[enigo-37]: https://github.com/enigo-rs/enigo/issues/37
[kulman]: https://blog.kulman.sk/implementing-auto-type-on-macos/
[delphihaven]: https://delphihaven.wordpress.com/2015/07/04/sending-keystrokes-on-os-x/
[sharmac]: https://sharmac1odewiki.blogspot.com/2015/01/cocoa-cgeventpost-hold-key-shift.html
[apple-73639]: https://developer.apple.com/forums/thread/73639
[apple-tap-loc]: https://developer.apple.com/documentation/coregraphics/cgeventtaplocation
[apple-source-state]: https://developer.apple.com/documentation/coregraphics/cgeventsourcestateid
[apple-flag-shift]: https://developer.apple.com/documentation/coregraphics/cgeventflags/kcgeventflagmaskshift
[apple-hiddriverkit]: https://developer.apple.com/documentation/hiddriverkit
[apple-vhid-26-4]: https://developer.apple.com/forums/thread/817003
[karabiner-vhid]: https://github.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice
[karabiner-vhid-client]: https://github.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice/blob/main/README.md
[foohid]: https://github.com/unbit/foohid
[ms-keyboard-modes]: https://learn.microsoft.com/en-us/windows-app/input-keyboard-mouse-touch-pen?tabs=macos
[citrix-keyboard]: https://docs.citrix.com/en-us/citrix-workspace-app-for-mac/devices/keyboard.html
[msq-vk]: https://learn.microsoft.com/en-gb/answers/questions/226490/virtual-key-codes-not-working-as-expected
[cpp-scancode]: https://cplusplus.com/forum/windows/77886/
[davis-scancodes]: https://www.michaelwda.com/post/scancodes
[ahk-send]: https://www.autohotkey.com/docs/v2/lib/Send.htm
[xdotool-readme]: https://github.com/jordansissel/xdotool/blob/main/README.md
[xdotool-wayland]: https://www.semicomplete.com/blog/xdotool-and-exploring-wayland-fragmentation/
[ydotool-readme]: https://github.com/ReimuNotMoe/ydotool/blob/master/README.md
[wtype-mankier]: https://www.mankier.com/1/wtype
[libei-phoronix]: https://www.phoronix.com/news/libei-1.0-Emulated-Input
[libei-rfc]: https://lists.freedesktop.org/archives/wayland-devel/2020-August/041589.html
[rdev-crates]: https://crates.io/crates/rdev
[rdev-docs]: https://docs.rs/rdev/latest/rdev/
[tfc-crates]: https://crates.io/crates/tfc
[hammerspoon-eventtap-docs]: https://www.hammerspoon.org/docs/hs.eventtap.html
[apple-ax-set]: https://developer.apple.com/documentation/applicationservices/1460434-axuielementsetattributevalue
[km-applescript]: https://forum.keyboardmaestro.com/t/unreliable-working-of-applescript-system-events-commands/11704
[apple-applescript-slow]: https://discussions.apple.com/thread/252159592
[apple-103992]: https://developer.apple.com/forums/thread/103992
[apple-cgevent-keyboard]: https://developer.apple.com/documentation/coregraphics/1456564-cgeventcreatekeyboardevent
[cgevent-header]: https://github.com/phracker/MacOSX-SDKs/blob/master/MacOSX10.9.sdk/System/Library/Frameworks/CoreGraphics.framework/Versions/A/Headers/CGEvent.h
