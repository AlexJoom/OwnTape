// Builds states.html (visual spec of every popup state, light + dark)
// from popup.html, so the gallery and the template never drift apart.
// Usage: node design/popup/build-states.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'popup.html'), 'utf8');

const pick = (re) => { const m = src.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const header = pick(/<header class="mr-header">[\s\S]*?<\/header>/);
const footer = pick(/<footer class="mr-footer">[\s\S]*?<\/footer>/);
const section = (name) =>
  pick(new RegExp(`<section class="mr-state" data-state="${name}"[\\s\\S]*?<\\/section>`))
    .replace(' hidden>', '>');

// Recovery card with n items (built from the <template>, as popup.js does).
const recoveryTpl = pick(/<section class="mr-recovery"[\s\S]*?<\/section>/);
const itemTpl = recoveryTpl.match(/<template id="recovery-item">([\s\S]*?)<\/template>/)[1];
const recovery = (items, confirming = false) => {
  const lis = items.map(([name, meta], i) => {
    let li = itemTpl.replace(/(mr-recovery__name"[^>]*>)[^<]*/, `$1${name}`).replace(/(mr-recovery__meta">)[^<]*/, `$1${meta}`);
    if (confirming && i === 0) li = li.replace('mr-recovery__delete" type="button">Delete', 'mr-recovery__delete is-confirming" type="button">Delete for good?');
    return li;
  }).join('');
  return recoveryTpl.replace(' hidden>', '>').replace(/<template[\s\S]*?<\/template>/, '')
    .replace(items.length > 1 ? 'A recording was not saved' : '\u0000', `${items.length} recordings were not saved`)
    .replace('<ul class="mr-recovery__list" id="recovery-list"></ul>', `<ul class="mr-recovery__list" id="recovery-list">${lis}</ul>`);
};
const errorVariant = (title, text, primary, secondary, detail) => {
  let h = section('error')
    .replace(/(id="error-title">)[^<]*/, `$1${title}`)
    .replace(/(id="error-text">)[^<]*/, `$1${text}`)
    .replace(/(id="btn-error-primary" type="button">)[^<]*/, `$1${primary}`);
  h = secondary
    ? h.replace(/(id="btn-error-secondary" type="button">)[^<]*/, `$1${secondary}`)
    : h.replace(/<button class="mr-btn mr-btn--secondary" id="btn-error-secondary"[^>]*>[^<]*<\/button>/, '');
  if (detail) h = h.replace('<p class="mr-error-detail" id="error-detail" hidden></p>', `<p class="mr-error-detail" id="error-detail">${detail}</p>`);
  return h;
};

// Variants that popup.js produces by changing text only.
const variants = [
  { id: 'not-meet', label: '1 · Not on a Meet tab', html: section('not-meet') },
  { id: 'ready', label: '2 · Ready (chat notice on)', html: section('ready') },
  {
    id: 'ready-edit', label: '2b · Ready, “Edit the message” open',
    html: section('ready').replace('<details class="mr-disclosure" id="notice-details">', '<details class="mr-disclosure" id="notice-details" open>'),
  },
  {
    id: 'ready-nonotice', label: '2c · Ready, chat notice off (long reminder comes back)',
    html: section('ready').replace('id="notice-toggle" aria-describedby="notice-hint" checked>', 'id="notice-toggle" aria-describedby="notice-hint">'),
  },
  { id: 'starting', label: '3 · Starting', html: section('starting') },
  { id: 'recording', label: '4 · Recording, notice posted', html: section('recording').replace('data-notice="posted" hidden', 'data-notice="posted"') },
  { id: 'recording-pending', label: '4a · Recording, notice being posted', html: section('recording').replace('data-notice="pending" hidden', 'data-notice="pending"') },
  { id: 'recording-failed', label: '4c · Recording, notice NOT posted (warning, recording continues)', html: section('recording').replace('data-notice="failed" role="alert" hidden', 'data-notice="failed" role="alert"') },
  {
    id: 'recording-nomic', label: '4b · Recording, microphone off, chat notice off',
    html: section('recording')
      .replace('<span id="mic-chip-text">Mic on</span>', '<span id="mic-chip-text">Mic off</span>')
      .replace('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
               '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>'),
  },
  { id: 'saving', label: '5 · Saving', html: section('saving') },
  { id: 'saved', label: '6 · Saved', html: section('saved') },
  { id: 'error-mic', label: '7a · Error: microphone blocked', html: section('error') },
  {
    id: 'error-tab-closed', label: '7b · Error: Meet tab closed during recording',
    html: section('error')
      .replace(/(id="error-title">)[^<]*/, '$1Recording stopped')
      .replace(/(id="error-text">)[^<]*/, '$1The Meet tab was closed. The part recorded so far is saved in your Downloads folder.')
      .replace(/(id="btn-error-primary" type="button">)[^<]*/, '$1Show in folder')
      .replace(/<button class="mr-btn mr-btn--secondary" id="btn-error-secondary"[^>]*>[^<]*<\/button>/, ''),
  },
  {
    id: 'error-capture', label: '7c · Error: cannot capture the tab (with technical detail)',
    html: errorVariant('Cannot record this tab', 'Another extension or app possibly records this tab now. Stop it, reload the Meet tab, then try again.', 'Try again', null, 'Cannot capture a tab with an active stream.'),
  },
  {
    id: 'error-mic-first', label: '7d · Microphone not allowed yet (first use)',
    html: errorVariant('Allow your microphone first', 'To record your voice, allow the microphone one time. Or record only the call audio.', 'Allow microphone', 'Record without my microphone'),
  },
  {
    id: 'error-crash', label: '7e · Recording stopped unexpectedly + recovery card',
    pre: recovery([['abc-defg-hij · 10 Nov, 14:03', '23 min · 140 MB · kept on this computer']]),
    html: errorVariant('The recording stopped unexpectedly', 'The part that was recorded is safe. Save it with the button above.', 'OK', null),
  },
  {
    id: 'error-generic', label: '7f · Error: something went wrong (generic)',
    html: errorVariant('Something went wrong', 'OwnTape could not finish this action. Try again. If it happens again, report it on GitHub with the detail below.', 'OK', null, 'Error: Offscreen document is not available.'),
  },
  {
    id: 'recovery-ready', label: '8 · Ready + recovery card (target card hides to save space)',
    pre: recovery([['abc-defg-hij · 10 Nov, 14:03', '23 min · 140 MB · kept on this computer']]),
    html: section('ready'),
  },
  {
    id: 'recovery-two', label: '8b · Not on a Meet tab + 2 unsaved recordings, “Delete” waits for a 2nd click',
    pre: recovery([['abc-defg-hij · 10 Nov, 14:03', '23 min · 140 MB · kept on this computer'], ['xyz-abcd-efg · 9 Nov, 09:30', '51 min · 305 MB · kept on this computer']], true),
    html: section('not-meet'),
  },
];
// Ids must be unique in one document: suffix them per instance.
const uniq = (html, suffix) => html
  .replace(/\bid="([^"]+)"/g, `id="$1-${suffix}"`)
  .replace(/\b(for|aria-labelledby|aria-describedby)="([^"]+)"/g, `$1="$2-${suffix}"`);

const popup = (v, theme) => uniq(`
<div class="mr-popup mr-frame" data-theme="${theme}">
  ${header}
  <main>${v.pre || ''}${v.html}</main>
  ${footer}
</div>`, `${v.id}-${theme}`);

const rows = variants.map((v) => `
<section class="pv-row" id="${v.id}" aria-labelledby="pv-${v.id}">
  <h2 class="pv-label" id="pv-${v.id}">${v.label}</h2>
  <div class="pv-pair">
    <figure><figcaption>Light</figcaption>${popup(v, 'light')}</figure>
    <figure><figcaption>Dark</figcaption>${popup(v, 'dark')}</figure>
  </div>
</section>`).join('\n');

const out = `<!doctype html>
<!-- GENERATED by build-states.mjs from popup.html — do not edit by hand. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Popup States</title>
<link rel="stylesheet" href="popup.css">
<link rel="stylesheet" href="preview.css">
</head>
<body class="pv">
<header class="pv-head">
  <h1>OwnTape — popup states</h1>
  <p>Visual spec. Width 340&nbsp;px. Each state shows the light and the dark theme. Copy markup from <code>popup.html</code>, styles from <code>popup.css</code>.</p>
  <nav aria-label="States"><ul>${variants.map((v) => `<li><a href="#${v.id}">${v.label}</a></li>`).join('')}</ul></nav>
</header>
${rows}
</body>
</html>
`;
writeFileSync(join(here, 'states.html'), out);
console.log('states.html written:', variants.length, 'states');
