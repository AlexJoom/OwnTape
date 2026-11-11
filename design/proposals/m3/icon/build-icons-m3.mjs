// M3 proposal: three toolbar states (Usage: node design/proposals/m3/icon/build-icons-m3.mjs)
//   idle  = not a Meet tab: muted glyph, no tile (ring + dot in #7f86b8,
//           >= 3:1 on light and dark Chrome toolbars)
//   ready = Meet tab, not recording: the full brand icon (indigo tile) — same as design/icon/icon-*.png
//   rec   = recording: red tile + one solid dot — same as design/icon/icon-recording-*.png
// Difference without colour: idle has no tile (outline glyph); ready has a filled tile with
// a ring; rec has a filled tile with a solid disc.
import { writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const png = join(here, 'png'); mkdirSync(png, { recursive: true });
const IDLE = '#7f86b8';
const idle = (size) => {
  const g = size === 16
    ? `<circle cx="8" cy="8" r="5" fill="none" stroke="${IDLE}" stroke-width="2"/><circle cx="8" cy="8" r="2" fill="${IDLE}"/>`
    : `<circle cx="8" cy="8" r="5.6" fill="none" stroke="${IDLE}" stroke-width="1.7"/><circle cx="8" cy="8" r="2.5" fill="${IDLE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">${g}</svg>\n`;
};
writeFileSync(join(here, 'icon-idle.svg'), idle(128).replace(/ width="128" height="128"/, ''));
writeFileSync(join(here, 'icon-idle-16.svg'), idle(16).replace(/ width="16" height="16"/, ''));
const tmp = join(here, '.tmp'); mkdirSync(tmp, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const name = `icon-idle-${size}.png`;
  writeFileSync(join(tmp, name + '.svg'), idle(size));
  writeFileSync(join(tmp, name + '.html'), `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${name}.svg" width="${size}" height="${size}">`);
  execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${join(png, name)}`, 'file://' + join(tmp, name + '.html')], { stdio: 'ignore' });
  // ready + rec = the current brand icons (unchanged).
  copyFileSync(join(here, `../../../icon/png/icon-${size}.png`), join(png, `icon-ready-${size}.png`));
  copyFileSync(join(here, `../../../icon/png/icon-recording-${size}.png`), join(png, `icon-recording-${size}.png`));
}
rmSync(tmp, { recursive: true, force: true });

// Preview: the three states on light and dark toolbars, at 1x (16 px) and 2x (32 px).
const bars = [['Light toolbar', '#ffffff', '#1f1f1f'], ['Dark toolbar', '#35363a', '#e8eaed']];
const states = [['idle', 'Not a Meet tab'], ['ready', 'Meet tab — ready'], ['recording', 'Recording']];
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:20px;font:13px/1.4 system-ui,sans-serif;background:#d9d9de;display:grid;gap:14px}
.bar{display:flex;gap:28px;align-items:center;padding:12px 18px;border-radius:10px}
.cell{display:grid;justify-items:center;gap:6px}.row{display:flex;gap:10px;align-items:center}
img.x1{width:16px;height:16px;image-rendering:pixelated}img.x2{width:32px;height:32px}</style>
${bars.map(([n, bg, fg]) => `<div class="bar" style="background:${bg};color:${fg}"><b style="width:100px">${n}</b>${states.map(([s, l]) => `<div class="cell"><div class="row"><img class="x1" src="png/icon-${s}-16.png"><img class="x2" src="png/icon-${s}-32.png"></div>${l}</div>`).join('')}</div>`).join('')}`;
writeFileSync(join(here, 'toolbar-states.html'), html);
execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=620,190', `--screenshot=${join(here, 'toolbar-states.png')}`, 'file://' + join(here, 'toolbar-states.html')], { stdio: 'ignore' });
console.log('icons + toolbar-states.png written');
