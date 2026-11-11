// Chrome Web Store assets: 5 screenshots (1280x800), small promo tile
// (440x280), marquee (1400x560). Renders HTML → PNG with headless Chrome.
// Usage: node design/store/build-store.mjs
//
// REAL SCREENSHOTS: put real, unaltered captures (staged call, test
// accounts, no real faces/names) in design/store/shots/shot-{1..4}.png,
// size 1600x1000 or larger, 16:10, browser window content. Then run the
// script again. Without them, a labelled placeholder is drawn.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Change the name here only ----
const NAME = 'OwnTape';
const TAGLINE = 'Local recorder for Google Meet™';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'png');
const tmp = join(here, '.tmp');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const popupCss = readFileSync(join(here, '../popup/popup.css'), 'utf8');
const popupSrc = readFileSync(join(here, '../popup/popup.html'), 'utf8');
const pick = (re) => popupSrc.match(re)[0];
const header = pick(/<header class="mr-header">[\s\S]*?<\/header>/).replace('OwnTape', NAME);
const footer = pick(/<footer class="mr-footer">[\s\S]*?<\/footer>/);
const state = (n) => pick(new RegExp(`<section class="mr-state" data-state="${n}"[\\s\\S]*?<\\/section>`)).replace(' hidden>', '>');
// Recording: show the "notice posted" line (the consent aid), as the real UI does after a verified post.
const show = (html) => html.replace('data-notice="posted" hidden', 'data-notice="posted"');
const popup = (n, theme = 'light') => `<div class="mr-popup" data-theme="${theme}">${header}<main>${show(state(n))}</main>${footer}</div>`;

const MARK = (size, rec = false) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16"><defs><linearGradient id="g${size}${rec}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rec ? '#e5383b' : '#5348e6'}"/><stop offset="1" stop-color="${rec ? '#b91c1c' : '#3730a3'}"/></linearGradient></defs><rect width="16" height="16" rx="3.6" fill="url(#g${size}${rec})"/>${rec ? '<circle cx="8" cy="8" r="4.1" fill="#fff"/>' : '<circle cx="8" cy="8" r="4.6" fill="none" stroke="#fff" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" fill="#fff"/>'}</svg>`;
const ICON = {
  lock: '<path d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  tab: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
};
const ico = (n, size = 20, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const base = `
${popupCss}
*{box-sizing:border-box} html,body{margin:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,"Noto Sans",sans-serif;color:#1c1b21;-webkit-font-smoothing:antialiased}
.brand{display:flex;align-items:center;gap:14px}
.brand__name{font-weight:700;letter-spacing:-.02em;line-height:1}
.brand__tag{color:#47464f;margin-top:6px}
`;

// ---------- Screenshot frame ----------
const SHOTS = [
  { n: 1, title: 'One click to record.', sub: 'Join your call, click the icon, press Start. Video and all voices go into one file.', state: 'ready',
    ph: 'Real capture: staged Meet call (test accounts) with the popup open in the Ready state.' },
  { n: 2, title: 'It tells the participants for you.', sub: 'When the recording starts, a notice goes into the call chat. You can edit the text. Say it aloud too.', state: 'recording', focus: 'notice',
    ph: 'Real capture: staged call, Meet chat panel open with the OwnTape notice in it; popup shows “Notice posted in the chat”.' },
  { n: 3, title: 'See that it records.', sub: 'A clear timer, a red toolbar icon, and one Stop button. You can close the popup — the recording continues.', state: 'recording',
    ph: 'Real capture: staged call, popup in the Recording state, red toolbar icon visible.' },
  { n: 4, title: 'A normal video file on your computer.', sub: 'A .webm file in your Downloads folder. It plays in Chrome, Firefox and VLC.', state: 'saved',
    ph: 'Real capture: the saved .webm file playing in VLC (staged call, no real faces or names).' },
];

const shotHtml = (s) => {
  const real = join(here, 'shots', `shot-${s.n}.png`);
  const stage = existsSync(real)
    ? `<img class="real" src="file://${real}" alt="">`
    : `<div class="ph">
         <div class="ph__bar"><span></span><span></span><span></span><div class="ph__url">meet.google.com/abc-defg-hij</div><div class="ph__icon">${MARK(18, s.state === 'recording')}</div></div>
         <div class="ph__body"><div class="ph__label">PLACEHOLDER<br><small>${s.ph}</small></div></div>
         <div class="ph__popup ${s.focus === 'notice' ? 'ph__popup--focus' : ''}">${popup(s.state)}</div>
       </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  body{width:1280px;height:800px;overflow:hidden;background:#f1f2f6;display:grid;grid-template-columns:400px 1fr;align-items:center}
  .copy{padding:0 24px 0 64px}
  .copy .brand{margin-bottom:56px}
  .copy .brand__name{font-size:22px}
  .copy .brand__tag{font-size:13px}
  .kicker{font:700 13px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#4338ca;margin:0 0 16px}
  h1{font-size:40px;line-height:1.12;letter-spacing:-.025em;margin:0 0 20px}
  .sub{font-size:19px;line-height:1.5;color:#47464f;margin:0}
  .stage{height:800px;display:flex;align-items:center;padding-right:48px}
  .real{width:100%;border-radius:14px;box-shadow:0 20px 50px rgb(20 20 60 / .18),0 0 0 1px rgb(0 0 0 / .08)}
  .ph{position:relative;width:832px;height:520px;border-radius:14px;background:#fff;box-shadow:0 20px 50px rgb(20 20 60 / .18),0 0 0 1px rgb(0 0 0 / .08);overflow:visible}
  .ph__bar{height:44px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #e3e5ea;background:#f7f8fa;border-radius:14px 14px 0 0}
  .ph__bar>span{width:11px;height:11px;border-radius:50%;background:#d5d8de}
  .ph__url{margin-left:12px;flex:1;height:26px;border-radius:13px;background:#eae7ef;font-size:12px;color:#6b7280;display:flex;align-items:center;padding-left:14px}
  .ph__icon{width:28px;display:grid;place-items:center}
  .ph__body{position:absolute;inset:44px 0 0 0;border-radius:0 0 14px 14px;background:repeating-linear-gradient(135deg,#f3f4f7 0 14px,#eceef3 14px 28px);display:grid;place-items:center}
  .ph__label{font:700 15px/1.4 ui-monospace,Menlo,monospace;color:#8a90a0;text-align:center;letter-spacing:.08em;max-width:360px;margin-right:300px}
  .ph__label small{font:500 13px/1.5 system-ui;letter-spacing:0;display:block;margin-top:8px}
  .ph__popup{position:absolute;top:38px;right:10px;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px rgb(0 0 0 / .22),0 0 0 1px rgb(0 0 0 / .08);transform:scale(.92);transform-origin:top right}
  .ph__popup--focus .mr-notice-status{outline:3px solid #4338ca;outline-offset:2px}
  .mr-rec__dot{animation:none}
  </style></head><body>
  <div class="copy">
    <div class="brand">${MARK(40)}<div><div class="brand__name">${NAME}</div><div class="brand__tag">${TAGLINE}</div></div></div>
    <p class="kicker">${['', 'Simple', 'Honest', 'Clear', 'Yours'][s.n]}</p>
    <h1>${s.title}</h1>
    <p class="sub">${s.sub}</p>
  </div>
  <div class="stage">${stage}</div>
  </body></html>`;
};

// ---------- Screenshot 5: data-flow diagram (final, no capture needed) ----------
const shot5 = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
body{width:1280px;height:800px;overflow:hidden;background:#f1f2f6;display:grid;place-items:center;text-align:center}
.wrap{display:grid;gap:56px;justify-items:center}
.kicker{font:700 13px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#4338ca;margin:0 0 14px}
h1{font-size:44px;letter-spacing:-.025em;margin:0}
.flow{display:flex;align-items:center;gap:0}
.node{width:220px;height:200px;background:#fff;border-radius:18px;box-shadow:0 10px 30px rgb(20 20 60 / .08),0 0 0 1px #e1e3e9;display:grid;place-items:center;align-content:center;gap:14px}
.node__ic{width:72px;height:72px;border-radius:18px;display:grid;place-items:center;background:#e3dfff;color:#4338ca}
.node b{font-size:19px}
.node span{font-size:14px;color:#47464f;margin-top:-8px}
.arrow{width:90px;height:4px;background:#4338ca;position:relative;border-radius:2px}
.arrow::after{content:"";position:absolute;right:-2px;top:-7px;border:9px solid transparent;border-left:13px solid #4338ca;border-right:0}
.nope{display:flex;align-items:center;gap:28px;font-size:18px;color:#47464f}
.nope__item{display:flex;align-items:center;gap:10px}
.x{position:relative;color:#9aa1ad}
.x::after{content:"";position:absolute;left:-3px;right:-3px;top:50%;height:3px;background:#bc1317;transform:rotate(-35deg);border-radius:2px}
.brand{position:absolute;left:48px;bottom:40px;text-align:left}
.brand__name{font-size:18px} .brand__tag{font-size:12px}
</style></head><body>
<div class="wrap">
  <div><p class="kicker">Private by design</p><h1>No server. No account. No bot.</h1></div>
  <div class="flow">
    <div class="node"><div class="node__ic">${ico('tab', 36)}</div><b>Your Meet tab</b><span>video + all voices</span></div>
    <div class="arrow"></div>
    <div class="node"><div class="node__ic">${MARK(44)}</div><b>Your browser</b><span>records with ${NAME}</span></div>
    <div class="arrow"></div>
    <div class="node"><div class="node__ic">${ico('folder', 36)}</div><b>Your computer</b><span>.webm in Downloads</span></div>
  </div>
  <div class="nope">
    <div class="nope__item"><span class="x">${ico('cloud', 28)}</span>No upload</div>
    <div class="nope__item"><span class="x">${ico('lock', 26)}</span>No sign-in</div>
    <div class="nope__item"><span class="x">${ico('code', 26)}</span>No tracking code</div>
  </div>
</div>
<div class="brand">${MARK(32)}<div><div class="brand__name">${NAME}</div><div class="brand__tag">${TAGLINE}</div></div></div>
</body></html>`;

// ---------- Small promo tile 440x280 ----------
const tile = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
body{width:440px;height:280px;overflow:hidden;background:linear-gradient(160deg,#2b2580 0%,#17154a 100%);color:#fff;display:grid;align-content:center;padding:0 36px;gap:22px}
.brand{gap:16px}
.brand__name{font-size:38px}
.brand__tag{color:#c9cdf8;font-size:15px;margin-top:8px}
.brand svg{border-radius:22%;box-shadow:0 0 0 2px rgb(255 255 255 / .28)}
.pills{display:flex;gap:8px}
.pills span{font-size:13px;font-weight:600;padding:5px 11px;border-radius:8px;background:rgb(255 255 255 / .1);color:#e6e8ff;border:1px solid rgb(255 255 255 / .16)}
</style></head><body>
<div class="brand">${MARK(64)}<div><div class="brand__name">${NAME}</div><div class="brand__tag">${TAGLINE}</div></div></div>
<div class="pills"><span>Free</span><span>Open source</span><span>100% local</span></div>
</body></html>`;

// ---------- Marquee 1400x560 ----------
const marquee = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
body{width:1400px;height:560px;overflow:hidden;background:linear-gradient(160deg,#2b2580 0%,#17154a 100%);color:#fff;display:grid;grid-template-columns:1fr 460px;align-items:center;padding:0 80px 0 96px}
.brand{gap:18px;margin-bottom:40px}
.brand__name{font-size:34px}
.brand__tag{color:#c9cdf8;font-size:15px;margin-top:8px}
h1{font-size:52px;line-height:1.08;letter-spacing:-.03em;margin:0 0 22px;max-width:640px}
.sub{font-size:20px;color:#d4d7fb;margin:0 0 30px;max-width:560px;line-height:1.5}
.brand svg{border-radius:22%;box-shadow:0 0 0 2px rgb(255 255 255 / .28)}
.pills{display:flex;gap:10px}
.pills span{display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;padding:7px 14px;border-radius:8px;background:rgb(255 255 255 / .1);color:#e6e8ff;border:1px solid rgb(255 255 255 / .16)}
.shot{justify-self:end;border-radius:14px;overflow:hidden;box-shadow:0 30px 60px rgb(0 0 0 / .4),0 0 0 1px rgb(255 255 255 / .1);transform:scale(1.04) rotate(-1.5deg);transform-origin:center}
.mr-rec__dot{animation:none}
</style></head><body>
<div>
  <div class="brand">${MARK(56)}<div><div class="brand__name">${NAME}</div><div class="brand__tag">${TAGLINE}</div></div></div>
  <h1>Record your calls. Keep them on your computer.</h1>
  <p class="sub">Video and all voices in one file. No account, no bot, no upload.</p>
  <div class="pills"><span>${ico('check', 16, 2.6)}Free</span><span>${ico('code', 16, 2.4)}Open source</span><span>${ico('lock', 16, 2.4)}100% local</span></div>
</div>
<div class="shot">${popup('recording')}</div>
</body></html>`;

// ---------- Render ----------
const jobs = [
  ...SHOTS.map((s) => ({ name: `screenshot-${s.n}`, html: shotHtml(s), w: 1280, h: 800 })),
  { name: 'screenshot-5', html: shot5, w: 1280, h: 800 },
  { name: 'promo-small-440x280', html: tile, w: 440, h: 280 },
  { name: 'marquee-1400x560', html: marquee, w: 1400, h: 560 },
];
for (const j of jobs) {
  const f = join(tmp, j.name + '.html');
  writeFileSync(f, j.html);
  execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', `--window-size=${j.w},${j.h}`, `--screenshot=${join(out, j.name + '.png')}`, 'file://' + f], { stdio: 'ignore' });
  console.log(`png/${j.name}.png  ${j.w}x${j.h}`);
}
// Note: the pages have an opaque background, so Chrome writes 24-bit RGB PNGs (no alpha), as the store asks.
rmSync(tmp, { recursive: true, force: true });
