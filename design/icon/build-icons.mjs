// Generates the extension icons (SVG sources + PNG exports).
// Usage: node design/icon/build-icons.mjs
// Needs: google-chrome in PATH (headless screenshot = PNG renderer).
//
// Concept: a "record" mark — white ring + white dot — on a calm indigo
// rounded tile. No camera shape, no Google colours.
// Recording variant: red tile + one big solid dot (no ring), so the
// change is visible by shape too, not only by colour.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pngDir = join(here, 'png');
mkdirSync(pngDir, { recursive: true });

export const COLORS = {
  idleTop: '#5348e6', idleBottom: '#3730a3', idleFlat: '#4338ca',
  recTop: '#e5383b', recBottom: '#b91c1c', recFlat: '#d42020',
  mark: '#ffffff',
};

// All geometry is on a 16-unit grid. `pad` = transparent margin (grid units).
// Two geometries: "small" is pixel-snapped for 16 px; "large" for >= 32 px.
function svg({ variant = 'idle', geometry = 'large', pad = 0, gradient = true }) {
  const s = 16 - pad * 2;              // tile size
  const k = s / 16;                    // scale for the mark
  const c = 8;                         // centre
  const rx = geometry === 'small' ? 3.5 : 3.6 * k;
  const top = variant === 'rec' ? COLORS.recTop : COLORS.idleTop;
  const bottom = variant === 'rec' ? COLORS.recBottom : COLORS.idleBottom;
  const flat = variant === 'rec' ? COLORS.recFlat : COLORS.idleFlat;
  const fill = gradient ? 'url(#g)' : flat;
  const defs = gradient
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`
    : '';
  let mark;
  if (variant === 'rec') {
    const r = geometry === 'small' ? 4 : 4.1 * k;
    mark = `<circle cx="${c}" cy="${c}" r="${r}" fill="${COLORS.mark}"/>`;
  } else if (geometry === 'small') {
    // outer edge 3..13, inner 4..12 (1 px ring), dot 6..10 → crisp at 16 px
    mark = `<circle cx="8" cy="8" r="4.5" fill="none" stroke="${COLORS.mark}" stroke-width="1"/>`
         + `<circle cx="8" cy="8" r="2" fill="${COLORS.mark}"/>`;
  } else {
    mark = `<circle cx="${c}" cy="${c}" r="${4.6 * k}" fill="none" stroke="${COLORS.mark}" stroke-width="${1.3 * k}"/>`
         + `<circle cx="${c}" cy="${c}" r="${2.2 * k}" fill="${COLORS.mark}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${defs}`
    + `<rect x="${pad}" y="${pad}" width="${s}" height="${s}" rx="${rx}" fill="${fill}"/>${mark}</svg>\n`;
}

// Source SVGs (edit COLORS / geometry above, not these files).
const sources = {
  'icon.svg': svg({ variant: 'idle' }),
  'icon-recording.svg': svg({ variant: 'rec' }),
  'icon-16.svg': svg({ variant: 'idle', geometry: 'small', gradient: false }),
  'icon-recording-16.svg': svg({ variant: 'rec', geometry: 'small', gradient: false }),
};
for (const [f, s] of Object.entries(sources)) writeFileSync(join(here, f), s);

// PNG exports. Padding follows Chrome guidance: the 128 px store/install
// icon has 96 px artwork + 16 px transparent margin on each side.
const exports = [
  { size: 16, pad: 0, geometry: 'small', gradient: false },
  { size: 32, pad: 0.5, geometry: 'large', gradient: true },
  { size: 48, pad: 1, geometry: 'large', gradient: true },
  { size: 128, pad: 2, geometry: 'large', gradient: true },
];
const tmp = join(here, '.tmp');
mkdirSync(tmp, { recursive: true });
for (const variant of ['idle', 'rec']) {
  for (const e of exports) {
    const name = `${variant === 'rec' ? 'icon-recording' : 'icon'}-${e.size}.png`;
    const svgFile = join(tmp, name + '.svg');
    writeFileSync(svgFile, svg({ variant, ...e }).replace('<svg ', `<svg width="${e.size}" height="${e.size}" `));
    const html = join(tmp, name + '.html');
    writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${name}.svg" width="${e.size}" height="${e.size}">`);
    execFileSync('google-chrome', [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${e.size},${e.size}`,
      `--screenshot=${join(pngDir, name)}`, 'file://' + html,
    ], { stdio: 'ignore' });
    console.log('png/' + name);
  }
}
rmSync(tmp, { recursive: true, force: true });
