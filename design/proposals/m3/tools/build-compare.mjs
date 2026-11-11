// Builds compare.html + compare-popup.png + compare-welcome.png from the PNGs in compare/current and compare/m3.
// Usage (after tools/shoot.mjs runs): node design/proposals/m3/tools/build-compare.mjs
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [['ready', 'Ready'], ['settings', 'Settings'], ['recording-failed', 'Recording, notice not posted'], ['recording-micfail', 'Recording, microphone warning'],
  ['saved', 'Saved'], ['error-mic', 'Error: microphone blocked'], ['recovery-ready', 'Recovery card + Ready']];
const css = `body{margin:0;padding:24px;background:#e4e4ea;font:14px/1.4 system-ui,sans-serif;color:#1c1b21}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#47464f}
.grid{display:grid;grid-template-columns:repeat(4,340px);gap:12px 16px;align-items:start}
.h{font-weight:600;font-size:13px;color:#47464f}.lbl{grid-column:1/-1;font-weight:600;margin-top:10px}
img{width:340px;border-radius:12px;box-shadow:0 4px 18px rgb(0 0 0/.14),0 0 0 1px rgb(0 0 0/.08);display:block}
.new{grid-column:1/-1;font-weight:600;margin-top:10px}`;
const popupHtml = (title) => `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${css}</style>
<h1>OwnTape popup — current vs. Material 3 proposal</h1><p>Same markup, same texts. Only the stylesheet changes (plus the new pin hint and shortcut line in M3).</p>
<div class="grid"><div class="h">Current · light</div><div class="h">M3 · light</div><div class="h">Current · dark</div><div class="h">M3 · dark</div>
${rows.map(([id, l]) => `<div class="lbl">${l}</div>${['current/' + id + '-light', 'm3/' + id + '-light', 'current/' + id + '-dark', 'm3/' + id + '-dark'].map((f) => `<img src="compare/${f}.png" alt="${l}">`).join('')}`).join('')}
<div class="new">New: discoverability tips (pin hint + shortcut line), M3 only</div><div></div><img src="compare/m3/ready-pin-light.png" alt=""><div></div><img src="compare/m3/ready-pin-dark.png" alt="">
</div>`;
const welcomeHtml = `<!doctype html><meta charset="utf-8"><title>Welcome compare</title><style>body{margin:0;padding:24px;background:#e4e4ea;font:600 14px system-ui,sans-serif;color:#47464f}
.g{display:grid;grid-template-columns:repeat(2,550px);gap:8px 20px}img{width:550px;border-radius:10px;box-shadow:0 0 0 1px rgb(0 0 0/.1)}</style>
<div class="g"><div>Current · welcome page</div><div>M3 · welcome page</div><img src="compare/current/welcome-light.png"><img src="compare/m3/welcome-light.png">
<img src="compare/current/welcome-dark.png"><img src="compare/m3/welcome-dark.png"></div>`;
writeFileSync(join(root, 'compare.html'), popupHtml('Popup Comparison'));
writeFileSync(join(root, 'compare-welcome.html'), welcomeHtml);
const shot = (html, out, w, h) => execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`, `--screenshot=${join(root, out)}`, 'file://' + join(root, html)], { stdio: 'ignore' });
shot('compare.html', 'compare-popup.png', 1460, 5400);
shot('compare-welcome.html', 'compare-welcome.png', 1190, 1600);
console.log('compare files written');
