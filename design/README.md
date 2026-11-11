# Design — OwnTape

Status: all deliverables are ready. Since 2026-11-11 the UI uses **Material 3** (approved for 1.0.0; record of the proposal: `proposals/m3/`). Store screenshots 1–4 have placeholders until real captures exist.

## Files

| Path | What |
|---|---|
| `popup/popup.html` | Production popup template. All 7 states as `<section data-state="…" hidden>`. Copy it to the extension. |
| `popup/popup.css` | Popup styles: Material 3 tokens (`--md-*`, light/dark) + components. Copy it to the extension. |
| `popup/states.html` | Visual spec: every state (and the variants) in light and dark. Open it in Chrome. Generated; do not edit. |
| `popup/build-states.mjs` | Regenerates `states.html` from `popup.html`: `node design/popup/build-states.mjs` |
| `popup/preview.css` | Gallery-only styles. Do not ship. |
| `icon/icon.svg`, `icon/icon-recording.svg` | Master SVGs (>= 32 px). |
| `icon/icon-16.svg`, `icon/icon-recording-16.svg` | Pixel-snapped SVGs for 16 px. |
| `icon/png/icon-{16,32,48,128}.png` | Brand icon (manifest `icons`: store, extensions page). |
| `icon/icon-idle.svg`, `icon/icon-idle-16.svg`, `icon/png/icon-idle-{16,32,48,128}.png` | Toolbar, not a Meet tab: muted ring + dot, no tile. |
| `icon/png/icon-ready-{16,32,48,128}.png` | Toolbar, Meet call tab: the brand icon (same pixels as `icon-*.png`). |
| `icon/toolbar-states.png` (+ `.html`) | Preview of the 3 toolbar states on light and dark toolbars. |
| `icon/png/icon-recording-{16,32,48,128}.png` | Recording icon exports (toolbar). |
| `pages/mic-permission.html` | Microphone permission page. Status panels `[data-status=waiting|granted|denied]`, all `hidden`; JS shows one. Notes in the file header. |
| `pages/welcome.html` | First-run page (3 steps + optional mic + facts). Open on `onInstalled` (reason "install"). |
| `pages/pages.css` | Styles for both pages (same M3 tokens as the popup, light/dark). |
| `store/png/screenshot-{1..5}.png` | 1280×800 store screenshots. 1–4: placeholder stage; 5 (data-flow diagram) is final. |
| `store/png/promo-small-440x280.png`, `store/png/marquee-1400x560.png` | Promo images (final, no Meet UI in them). |
| `store/build-store.mjs` | Regenerates all store PNGs. Name/tagline: constants `NAME`, `TAGLINE` at the top. |
| `store/shots/` | Put real captures here as `shot-1.png` … `shot-4.png` (16:10, ≥ 1600×1000). The script then uses them instead of the placeholder. |
| `brand/` | Wordmark, lockup (primary logo) and the tape-reel proposal. See `brand/README.md`. |
| `icon/build-icons.mjs` | Regenerates all SVGs and PNGs, incl. idle/ready and the preview (needs `google-chrome`): `node design/icon/build-icons.mjs` |
| `tools/measure.mjs` | Prints the height of every popup state: `node design/tools/measure.mjs design/popup/states.html` (limit 600 px). |
| `tools/shoot.mjs` | PNG per popup state: `node design/tools/shoot.mjs design/popup/states.html <outdir> ready,settings` |
| `tools/gen-scheme.mjs` | Prints the M3 tonal palettes from the seed `#4338CA` (dev tool; instructions in the file). |
| `proposals/m3/` | The approved Material 3 proposal (comparison images, method, brand-risk notes). Record only; the final files are the ones above. |

## Notes for the developer

### Popup
- Width 340 px. `body.mr-body > div.mr-popup`. Height follows the content.
- Show one state: remove `hidden` from one `[data-state]` section, set it on the others.
- States: `not-meet`, `ready`, `starting`, `recording`, `saving`, `saved`, `error`.
- On each state change, write one short sentence into `#sr-status` (role=status) for screen readers, for example "Recording started", "Recording saved".
- `#timer` has `role="timer"`: update its text every second (format `HH:MM:SS`). It is not announced.
- `#mic-toggle` is a native checkbox with `role="switch"`. Keep its value in `chrome.storage.local` (default: on).
- Recording state: set `#mic-chip-text` to "Mic on" / "Mic off". For "Mic off", also use the crossed mic icon (see variant 4b in `states.html`). `#size-chip-text` is optional ("≈ 86 MB"); hide the chip if you do not compute the size.
- Saved state: fill `#file-name` and `#file-meta` ("48 min · 312 MB · Downloads folder"). "Show in folder" → `chrome.downloads.show(downloadId)`.
- Error state: fill `#error-title`, `#error-text`, and the button labels. Hide `#btn-error-secondary` when not used. Texts for 3 errors are in `states.html` (7a mic blocked, 7b tab closed, 7c capture failed).
- "Allow microphone" opens the microphone permission page (deliverable 3, it comes next).
- **Consent aid (chat notice)**
  - Ready: `#notice-toggle` (switch, default on, remember the last choice) and `#notice-text` (textarea, maxlength 500) inside `<details id="notice-details">` ("Edit the message"). `#btn-notice-reset` puts back the default text: "I am recording this call with OwnTape. Tell me if you do not agree."
  - CSS (`:has(.js-notice-toggle:not(:checked))`) hides the editor and shows the long consent reminder when the toggle is off. No JS needed for this. Keep the class `js-notice-toggle` on the switch.
  - Recording: three blocks `[data-notice="pending" | "posted" | "failed"]`, all `hidden`. Show ONE. Show "posted" only after you verify the message in the chat. Show none if the toggle was off.
  - Buttons: `#btn-notice-repost` (Post the notice again), `#btn-notice-copy` (copy the text; then change its label to "Copied" for 2 s), `#btn-notice-retry`.
  - "failed" is a warning (`role="alert"`), not the error state. The recording continues.
- File name (developer's format, adopted): `meet-<meeting-code>-YYYY-MM-DD-HHmm.webm`.
- The product name (OwnTape) occurs only in `<title>` and `.js-app-name`. You can also fill it from `chrome.i18n.getMessage("appName")`.
- Links: Help → repo `#readme`, Source → repo, Privacy → `PRIVACY.md` in the repo (the developer must create that file).
- CSP: no inline scripts, no inline handlers, no `style=""` attributes. Inline SVG is used for the icons (it is not script).
- Motion: the red dot pulses, the spinner turns. Both stop with `prefers-reduced-motion`.
- **Pin hint (`#tips`)**: one low card at the end of `<main>`, above the footer. JS removes `hidden` from `#tips` only in the idle views (not-meet, ready, saved, error) and from `#pin-hint` only when `(await chrome.action.getUserSettings()).isOnToolbar === false`. CSS hides the card when no tip shows and when the recovery card shows (600 px limit). No keyboard shortcut (cancelled by the user). Variants 2d, 2e, 6b.

### Toolbar icon (three states)
| State | When | Files |
|---|---|---|
| idle | not a Meet call tab | `icon-idle-{16,32}.png` — muted ring + dot, no tile |
| ready | Meet call tab, nothing records | `icon-ready-{16,32}.png` — brand indigo tile |
| recording | while it records (wins over the others) | `icon-recording-{16,32}.png` — red tile, solid dot |

- The three differ by shape too (no tile / tile + ring / tile + solid disc), for colour-blind users. The idle colour `#7F86B8` has ≥ 3:1 on light and dark Chrome toolbars.
- manifest: `action.default_icon` = the `icon-idle-*` set; `icons` (store, extensions page) = the brand `icon-{16,32,48,128}.png`.
- Ready tooltip: "OwnTape – click to record this call". Recording: `setTitle({ title: 'OwnTape — recording' })`.
- No badge. At 16 px a badge covers the mark, and the icons already show the state.

### Recovery card ("A recording was not saved")
- `#recovery` is the FIRST child of `<main>`, above the state sections. Show it with the idle states (not-meet, ready, saved, error).
- One `<li>` per item: clone `<template id="recovery-item">`. `.mr-recovery__name` = "<meeting code> · <local date, time>" (for example "abc-defg-hij · 10 Nov, 14:03"); full file name in its `title`. `.mr-recovery__meta` = "23 min · 140 MB · kept on this computer".
- Title: "A recording was not saved" or "N recordings were not saved".
- `.mr-recovery__save` = secondary button (Start stays the only primary button). `.mr-recovery__delete` = 2 clicks, no `confirm()`: 1st click → class `is-confirming`, label "Delete for good?"; 2nd click within 4 s → delete; otherwise restore. Announce the result in `#sr-status`.
- While the card is visible, CSS hides the "Tab to record" card and the switch hints (height stays under 600 px with up to 2 items; with 3 or more, the popup scrolls).
- Visual spec: `states.html` variants 7e, 8, 8b.

### Error texts (all in `states.html`, 7a–7f)
- 7d "Allow your microphone first" (developer text, adopted).
- 7e Crash: title "The recording stopped unexpectedly", text "The part that was recorded is safe. Save it with the button above.", button OK. Use this instead of the generic error when a recovery item exists.
- 7f Generic: title "Something went wrong", text "OwnTape could not finish this action. Try again. If it happens again, report it on GitHub with the detail below.", button OK. Put the raw message in `#error-detail`, not in `#error-text`.
- 7c: put the technical reason in `#error-detail` (small monospace line), not in brackets after the text.

### Microphone problems (popup + permission page)
- Popup, Recording state: `#mic-warning` (warning callout with crossed-mic icon, `role="alert"`). Title from `MIC_TEXTS[kind].title`, then "Your voice is not in the recording. The recording continues." Technical line in `#mic-warning-detail` (hidden when empty). Set the mic chip to "Mic off" too. Buttons: `#btn-mic-fix` "How to fix" (opens mic-permission.html in a new tab; not for 'no-device') and `#btn-mic-copy` "Copy details" (hidden by CSS when the detail is empty). With 2 warnings, CSS makes the recording card smaller (584 px). Variants 4d, 4e.
- When any warning shows in the Recording state, CSS hides the "You can close this window…" hint (`.mr-rec-hint`), so the popup stays under 600 px (4e = 507 px).
- Permission page: one panel `[data-status="error"]`. For "blocked": `#btn-settings` is the primary button, `#btn-retry` becomes secondary. `#err-os-note` has one `.os-line[data-os]` per OS (mac, win, linux, cros). Show only the user's OS line (`chrome.runtime.getPlatformInfo().os`). A last line says how to record without the voice.
- Texts (`MIC_TEXTS`):
  - blocked — "The microphone is blocked" / "Chrome blocks the microphone for OwnTape. Allow it in the Chrome settings, then try again."
  - not-asked — "Chrome stopped asking for the microphone" / "The question was closed several times, so Chrome now blocks it automatically. Allow the microphone in the settings of OwnTape, then come back to this tab."
  - Steps (#err-steps, for blocked AND not-asked; both open the extension's own site-settings page): 1. Click Open microphone settings. 2. Next to Microphone, select Allow. 3. Come back to this tab. OwnTape tries again by itself. If nothing happens, click Try again.
  - refused — "Chrome did not give the microphone to OwnTape" / "Chrome says that the microphone is allowed, but it did not give it to OwnTape. Reset the permission and reload OwnTape. Follow the steps below." Uses `#err-steps-reset`, `#err-reset-note`, `#btn-settings` (primary) and `#btn-extensions` (secondary); `#btn-retry` is hidden.
  - dismissed — "Chrome did not get an answer" / "The question about the microphone closed before you answered. Click Try again and select Allow."
  - no-device — "No microphone found" / "Connect a microphone or turn it on, then try again."
  - unreadable — "The microphone cannot be used" / "Another program possibly uses the microphone, or your operating system does not let Chrome use it. Close the other program or check the privacy settings below, then try again."
  - The "Or record only the call audio" part moves out of the texts. The page has its own line for it, and the popup error has the "Record without my microphone" button.

### Slow picture warning
- Popup, Recording state: `#video-warning` (info callout, indigo, monitor icon, `role="status"`, no buttons). Text: "**The picture updates slowly.** Keep the Meet window visible and the computer awake." Show it when the recorder gets fewer than ~10 frames per second for 30 s (screen locked or asleep, window covered). Hide it again when the frame rate is normal. It is information, not an error: the recording continues.
- All three recording warnings have the class `.mr-warn`. CSS counts them: 1 → the hint text hides; 2 → smaller recording card; 3 → the recording card is one row (status and timer) and the chips hide. Heights: 4f 478 px, 4e 584 px, 4g 552 px. Variants 4f, 4g.

### Saving progress
- Native `<progress id="saving-progress" class="mr-meter" max="100">`. No `value` attribute = moving bar (percentage not known yet). When known: `progress.value = 45` and `#saving-pct` = "45 %". Variants 5, 5b.

### Settings view and video quality
- Decision: one **Settings view inside the popup** (`section[data-state="settings"]`) for rarely changed things: video quality and the chat message text. The message editor moved out of the Ready state.
- Open it with the header gear `#btn-open-settings` or with `#btn-change-settings` ("Change") in the Ready summary line. `#btn-settings-back` returns to the previous state. Hide the gear in starting / recording / saving: the quality cannot change during a recording.
- Ready shows one summary line: "Video quality: <strong id="quality-summary">Standard</strong> · Change".
- Quality: radio group `name="quality"`, values `standard | high`, default `standard`, stored in `chrome.storage.local`. Save at once on change (no Save button); announce "Saved" in `#sr-status`. Small (720p) is dropped: code text was hard to read and it saved only 0.1–0.5 GB per hour.
- Size texts (measured, 5-minute runs, still → much motion): Standard "Up to 1080p · up to about 1 GB per hour" (0.45–1.07 GB/h); High, two lines: "Sharper only if the Meet window is larger than 1920×1080 pixels (large or HiDPI screens)." and "Uses more processor power · up to about 2 GB per hour" (0.52–1.95 GB/h). High is sharper only when the tab has more than 1920×1080 real pixels (HiDPI screen or very large window); on a normal 1080p screen it gives the same picture as Standard.
- Tip (info callout): "For a sharp shared screen: pin the presentation in Meet and make the window large. The recording shows what the tab shows."
- Recording state: new chip `#quality-chip` / `#quality-chip-text` ("Standard" | "High") between the mic chip and the size chip.
- Heights: Settings 565 px. Ready 516 px.
- Visual spec: `states.html` variants 2, 4, 9, 9b.

## Design decisions

- **Design system: Material 3**, written as our own CSS (no library: `@material/web` is in maintenance mode since June 2024, and the extension has no dependencies). Colour roles from the seed `#4338CA` (`tools/gen-scheme.mjs`; light primary = the seed, tone 35), M3 type scale in the system font, shape scale 4/8/12/16 px, tonal surfaces, state layers (hover 8 %, pressed 12 %), focus indicator 3 px.
- **Own identity inside M3:** indigo (not Google blue), system font (no Roboto / Google Sans, no web font), **square** button shape (M3 Expressive; Meet uses pills), our own SVG icons (no Material Symbols), no FAB.
- **Red is a signal, not a background:** the recording card is a neutral surface with a red dot and a red "RECORDING" label; the Stop button is red (tone 40 light, tone 44 dark — not the M3 pink). Errors and warnings use amber. "Delete" in the recovery card is neutral until the second click.

- **Tone:** calm and clear. Indigo for the brand and normal actions; red only for "recording" and "stop". No dark patterns, no alarm language.
- **Brand colour:** indigo `#4338CA` (dark theme primary: `#C3C0FF`). It is not a Google colour and not near the Meet palette.
- **Icon:** a "record" symbol (ring + dot) on a rounded tile. No camera, no Google shapes or colours. It does not depend on the name.
- **Recording icon:** red tile + one big solid dot. The shape changes too, not only the colour (colour-blind users).
- **Privacy is visible:** header pill "100% local", footer "Saves to your Downloads folder".
- **Consent reminder:** always visible in the Ready state, just above Start. Not a blocking checkbox (less friction; the user stays responsible).
- **"You can close this window"** in the Recording state: users often think that closing the popup stops the recording.
- **Trademark:** "Google Meet" appears only as a description of where the extension works ("Open a Google Meet call", "meet.google.com"). Never in the name, logo or icon.

## Accessibility (WCAG 2.2 AA)

Checked contrast ratios (text ≥ 4.5:1, UI parts ≥ 3:1), M3 tokens:

| Pair | Light | Dark |
|---|---|---|
| on-surface / surface | 16.3 | 14.4 |
| on-surface-variant / surface | 8.9 | 10.9 |
| on-surface-variant / surface-container-high | 7.6 | 8.5 |
| on-primary / primary (filled button) | 7.9 | 7.7 |
| primary / surface (links, outlined buttons) | 7.5 | 10.9 |
| on-primary-container / primary-container (selected option) | 7.2 | 7.2 |
| white / rec (Stop button) | 6.5 | 5.6 |
| rec label / surface-container-high (recording card) | 5.3 | 8.5 |
| rec dot / surface-container-high (non-text) | 5.3 | 4.5 |
| on-warn-container / warn-container (warnings, errors) | 7.3 | 7.3 |
| on-ok-container / ok-container | 8.3 | 7.3 |
| ok icon / surface-container | 5.5 | 9.6 |
| outline / surface-container-highest (switch off, non-text) | 3.5 | 3.9 |

- Keyboard: all controls are native `<button>`, `<a>`, `<input>`. Visible focus ring (3 px, offset 2 px) on all of them.
- Target size: buttons ≥ 40 px high (small 32 px), switch 52 × 32 px, icon buttons 40 × 40 px, radio 20 px (criterion 2.5.8).
- Heights (limit 600 px): highest states are 584 (two warnings), 580 (Ready, notice off + pin hint), 570 (recovery, two items), 565 (Settings).
- Each state section has a heading (`aria-labelledby`).

## Answered (Orchestrator, 2026-11-10)

1. Name: **OwnTape** (approved). MIT licence. Repository: https://github.com/AlexJoom/OwnTape. Keep the ring-and-dot icon.
2. Mic toggle default: on; remember the last choice.
3. Size chip: keep, as elapsed size only ("86 MB"), not a forecast.
4. Save target: always the Downloads folder. No "Save as" dialog.
5. The red recording icon replaces a "REC" badge.

## Store screenshots — how to make the real captures

- Staged call with test accounts. No real faces or names. Avatars or cameras off are fine.
- Do not edit or redraw the Meet UI. Only crop and scale the capture.
- Browser at 1600×1000 (16:10), light theme, no other extensions pinned, bookmarks bar hidden.
- shot-1: popup open, Ready state. shot-2: same, consent reminder visible. shot-3: Recording state, red toolbar icon visible. shot-4: the saved .webm playing in VLC (or the Downloads folder).

## Open points

- `marketing/04-store-listing.md` says "Record" button and "red badge". The UI says **Start recording** and uses a **red toolbar icon** (no badge). The listing text should follow the UI.
