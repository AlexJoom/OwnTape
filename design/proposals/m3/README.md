# Material 3 proposal for OwnTape

Status: **ADOPTED** on 2026-11-11 for version 1.0.0, with three changes: neutral recording card (red only as dot, label and Stop), no keyboard shortcut, pin hint only. The final files are in `design/popup`, `design/pages`, `design/icon`, `design/store`, `design/tools`. This folder is the record of the proposal; it still shows the red recording card and the shortcut line.

Look first:
- `compare-popup.png` (or `compare.html`): current vs. M3, 7 popup states, light and dark, same texts.
- `compare-welcome.png`: the welcome page, current vs. M3.
- `icon/toolbar-states.png`: the 3 toolbar states on light and dark toolbars.
- `popup/states.html`: all 28 popup states in M3, light and dark.
- `store/png/`: the store images in the new look.

## What is in the folder

| Path | What |
|---|---|
| `popup/popup.css` | M3 stylesheet. **Replaces `design/popup/popup.css` 1:1.** |
| `popup/popup.html` | Template. Same as today + the discoverability tips (developer hooks). |
| `popup/build-states.mjs`, `popup/states.html`, `popup/preview.css` | Gallery (28 states; new: 2d, 2e, 6b with tips). |
| `pages/pages.css` | M3 stylesheet for the full pages. **Replaces `design/pages/pages.css` 1:1.** |
| `pages/welcome.html` | Welcome page + discoverability hooks in step 2. |
| `pages/mic-permission.html` | Not changed (copy of the current file). It gets the new look from `pages.css`. |
| `icon/` | Toolbar icons for 3 states (idle / ready / recording), `build-icons-m3.mjs`, preview. |
| `store/build-store.mjs`, `store/png/` | Store screenshots, tile and marquee in the M3 look (real captures for 1–4 still needed, as today). |
| `tools/` | `gen-scheme.mjs` (colour palettes), `measure.mjs` (popup heights), `shoot.mjs` (PNG per state), `build-compare.mjs`. |

## Method

I agree with the Orchestrator's method: **M3 as the system, our own CSS tokens, small hand-written components, no library.**

- **No `@material/web`.** Material Web Components are in maintenance mode since June 2024: the team moved to Google's internal Wiz framework, and the project waits for new maintainers. No new work is planned. Also, the extension has no dependencies and no build step, so it stays small and easy to audit.
- **Colour:** I generated the palettes from our seed `#4338CA` with Google's `material-color-utilities` (dev tool only, `tools/gen-scheme.mjs`). The light primary is tone 35 of the seed palette, which is the seed itself. Thus OwnTape stays indigo and does not become Google blue. I did not use the default "tonal spot" variant: it turns the seed into a grey lavender (`#5A5891`) and the brand gets lost. The roles follow the M3 2025 tones: container T90/T30, on-container T30/T90, and surfaces from the neutral palette (chroma 6).
- **Custom colour groups (not harmonized):** recording red, warning amber and OK green.
- **Type:** the M3 type scale (title-medium 16/24, body-medium 14/20, label-large 14/20 500, body-small 12/16, label-medium 12/16), set in the **system font**.
- **Shape:** the M3 shape scale (4 / 8 / 12 / 16 px).
- **Elevation:** tonal surfaces (surface-container levels), with level-1 shadow on hover only.
- **State layers:** an `::after` overlay in the content colour, 8 % on hover and 12 % when pressed.
- **Focus:** the M3 focus indicator, 3 px with a 2 px offset.
- **Components:**

  | Component | M3 spec |
  |---|---|
  | Buttons | Filled, outlined and text, 40 px. Small buttons are 32 px. |
  | Switch | 52×32. The handle is 16 px when off and 24 px when on. |
  | Radio | 20 px ring, 10 px dot. |
  | Quality options | A segmented list: items with a 4 px gap, 12 px outer corners. |
  | Chips | Assist chips, density −2 (28 px). |
  | Cards | Filled cards in container colours. Our "callouts" use the same cards. |
  | Progress | Linear indicator, 4 px. |
  | Icon button | Standard, 40 px. |
  | Header | Small top app bar, 56 px. |

## Brand risk: how OwnTape keeps its own identity

M3 is a public design system. Many apps that are not Google products use it. The trademark rules are about names, logos and confusion with Google products, not about a design language. But a default M3 look (Google blue, Roboto, pill buttons, Material Symbols) is near the Meet UI. These choices keep a clear distance:

1. **Colour:** the indigo seed with the fidelity mapping, not baseline purple and not Google blue. Recording red is ours, and Google's four colours do not occur.
2. **Font:** the system font (`system-ui`). No Roboto, no Google Sans and no web font download, so the extension makes no network requests.
3. **Shape:** buttons use the M3 Expressive **square** shape (12 px corners, 16 px for the large Start/Stop). Meet and most Google apps use pill buttons.
4. **Icons:** our own inline SVG icons in our stroke style. No Material Symbols font.
5. **Brand marks:** the OwnTape icon, the record-O wordmark and the "100% local" chip stay. The toolbar and store icons are our tile, not a Google shape.
6. **No Google patterns:** no FAB and no Google-style top bar with an account avatar.
7. **Trademark text:** "for Google Meet™" and the trademark footer stay, as today.

Remaining risk: low. M3 switches and surfaces make the UI look "modern Android", not Meet. The store reviewer sees a third-party extension with its own name, icon and colour.

## Accessibility (WCAG 2.2 AA)

All pairs are checked. The lowest values are 5.5:1 for text and 3.5:1 for UI parts.

| Pair | Light | Dark |
|---|---|---|
| on-surface / surface | 16.3 | 14.4 |
| on-surface-variant / surface-container-high | 7.6 | 8.5 |
| on-primary / primary (filled button) | 7.9 | 7.7 |
| primary / surface (links, outlined button labels) | 7.5 | 10.9 |
| on-primary-container / primary-container (selected option) | 7.2 | 7.2 |
| white / rec (Stop) | 6.5 | 5.6 |
| on-rec-container / rec-container (recording card) | 7.2 | 7.2 |
| on-warn-container / warn-container (warnings, errors) | 7.3 | 7.3 |
| on-ok-container / ok-container | 8.3 | 7.3 |
| outline / surface-container-highest (switch off, 3:1 UI) | 3.5 | 3.9 |

Other accessibility points:
- **Red only for recording and stop:**
  - Errors are now amber. Today the error icon is red.
  - "Delete" in the recovery card is neutral. The second click ("Delete for good?") uses the rec colour, as today.
- **Stop in dark mode:** I use rec tone 44 (`#CB2020`), not the M3 default tone 80 (pink). A pink Stop button does not look like "stop".
- **Bigger targets:** switch 52×32, icon buttons 40×40, radio 20 px.
- **Reduced motion and keyboard:** the reduced-motion rules and the keyboard behaviour do not change.

## Heights (Chrome limit 600 px)

| View | Current | M3 |
|---|---|---|
| Ready | 536 | 516 |
| Ready + 2 tips (not pinned, shortcut set) | — | 569 |
| Ready, notice off + 2 tips (highest idle view) | — | 586 |
| Settings | 584 | 565 |
| Recording, two warnings | 592 | 584 |
| Recording, three warnings | 589 | 552 |
| Recovery card + Ready | 558 | 550 |
| Recovery card, two items | 597 | 570 |

All 28 states × 2 themes are below 600 px. Run `node design/proposals/m3/tools/measure.mjs design/proposals/m3/popup/states.html` to check.

## New elements in this proposal

### 1. Toolbar "ready" state: three icons, not a badge

| State | When | Icon |
|---|---|---|
| idle | not a Meet tab | Muted glyph: ring + dot in `#7F86B8`, **no tile**. Contrast is ≥ 3:1 on light and dark toolbars. |
| ready | Meet call tab, nothing records | The full brand icon: indigo tile, white ring + dot. These are the current `icon-*.png` files. |
| recording | while it records | Red tile, one solid dot. These are the current `icon-recording-*.png` files. |

I prefer three icons to a badge:
- A badge covers part of a 16 px icon.
- A badge is a second visual language.
- A grey "•" badge is hard to see.

With three icons, the toolbar "lights up" on a Meet tab. This works also without colour:
- idle has no tile;
- ready has a filled tile with a ring;
- recording has a filled tile with a solid disc.

For the developer:
- manifest `action.default_icon` = `icon-idle-{16,32}.png`;
- `READY_LOOK.icons` = `icon-ready-{16,32}.png`;
- the recording icon wins, as today;
- remove the badge;
- `icons` (store, extensions page) stays the brand icon.

### 2. Discoverability tips (developer hooks, branch "discoverability")

- **Popup:** `#tips` is one low card above the footer. It has one line per tip, with an icon:
  - `#pin-hint`: "Pin OwnTape: puzzle piece, then the pin." I made it short, so it is one line.
  - `#shortcut-line`: "Keyboard shortcut: `Alt+Shift+R`".
  - `#shortcut-none`: "No keyboard shortcut is set. Set a shortcut".

  CSS hides the card when no tip shows and when the recovery card shows. With tips, the gap between blocks is 12 px, not 14 px.
- **Welcome page, step 2:** the text with `#pin-hint`, then `#shortcut-line` ("Or press `…` on the Meet tab.") or `#shortcut-none` with the outlined button `#btn-shortcut-set`.

## Hook changes (complete list)

**Removed or renamed: none.** All the ids, classes and `data-state` hooks of today stay.

Added:
- `popup.html`: `#tips` (`.mr-tips`), `#pin-hint`, `#shortcut-line`, `#shortcut-key`, `#shortcut-none`, `#btn-shortcut-set` (`.mr-tip`, `.mr-link`). These are the developer's hooks, unchanged.
- `welcome.html`: `#pin-hint` (span in step 2), `#shortcut-line`, `#shortcut-key`, `#shortcut-none`, `#btn-shortcut-set`, and the new classes `.step__extra` and `.btn--sm`.
- CSS: the tokens are renamed from `--mr-*` to `--md-*`. No JS reads them.
- Text: the popup footer says "Saves to your Downloads folder" (no change). "Delete" is neutral until the second click.

## What improves

- **One system:** every control has a spec (size, shape, colour role and state layer), not a value picked one at a time. New UI is faster to design and stays consistent.
- **Generated colour scheme:** light and dark come from one seed. A new colour is one token, not two hand-picked values.
- **Clearer UI:**
  - Larger, clearer controls (switch, radio, icon buttons).
  - A 3 px focus ring.
  - Higher contrast in most pairs.
  - Red only for recording.
- **Toolbar:** it now tells "you can record here" on a Meet tab.

## What it costs

- **CSS size:**

  | File | Current | M3 |
  |---|---|---|
  | `popup.css` | 22.8 KB | 29.0 KB |
  | `pages.css` | 5.8 KB | 8.3 KB |

  Not minified, no build step.
- **Markup:** no rework. `popup.html` and the pages keep their structure. Only the tips block is new, and it is already in the developer's branch.
- **Store:** new screenshots 1–5, tile and marquee (done in `store/png/`). Real captures for screenshots 1–4 are still necessary, as today.
- **Risk:** visual only. No JS logic changes, apart from the icon paths.

## Recommendation

**Adopt fully for 1.0.0.** It is a CSS-level change with the same hooks, so the risk to the recorder is very low. The new look is more consistent and it is clearly better in dark mode.

Two decisions for the user:
1. **Dark recording card:** the deep red container (M3 tone 30) or a softer neutral card with a red dot.
2. **The idle toolbar icon:** the muted glyph (proposed) or the full brand icon on every tab.

## Estimate

| Who | Task | Time |
|---|---|---|
| Designer | Move the approved files to `design/popup`, `design/pages`, `design/icon`, `design/store`; update `design/README.md` (tokens, contrast table, heights) | about 1 h |
| Developer | Copy `popup.css`, `pages.css`; merge the tips block (same hooks); copy `welcome.html` step 2 | about 0.5 h |
| Developer | Icons: add `icon-idle-*` and `icon-ready-*`, manifest `default_icon`, `READY_LOOK.icons`, remove the badge | about 0.5 h |
| Developer | Visual check of all states (light/dark, Mac/Windows fonts), check the 600 px limit with real data | about 1–1.5 h |
| Developer | Store images: copy `store/png/` (and new real captures when they exist) | about 0.25 h |
| **Total** | | **about 3.5–4 h** |
