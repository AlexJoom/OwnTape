// Screenshots single popups from a states.html gallery: one PNG per <id>/<theme>.
// Usage: node tools/shoot.mjs <states.html> <outdir> <id[,id...]> [scale]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const [file, outdir, ids, scale = '2'] = [resolve(process.argv[2]), resolve(process.argv[3]), process.argv[4].split(','), process.argv[5]];
mkdirSync(outdir, { recursive: true });
const src = readFileSync(file, 'utf8');
const head = src.match(/<head>[\s\S]*?<\/head>/)[0].replace('<head>', `<head><base href="file://${dirname(file)}/">`)
  .replace('</head>', '<style>body{margin:0;padding:0;background:transparent}.mr-frame{border-radius:0;box-shadow:none}</style></head>');
const tmp = mkdtempSync(join(tmpdir(), 'm3s-'));
for (const id of ids) {
  const sec = src.match(new RegExp(`<section class="pv-row" id="${id}"[\\s\\S]*?</section>\\s*(?=<section class="pv-row"|</body>)`))[0];
  for (const theme of ['light', 'dark']) {
    const pop = sec.match(new RegExp(`<div class="mr-popup mr-frame" data-theme="${theme}">[\\s\\S]*?</footer>\\s*</div>`))[0];
    const h = join(tmp, `${id}-${theme}.html`);
    writeFileSync(h, `<!doctype html><html>${head}<body>${pop}<script>document.title=document.querySelector('.mr-popup').offsetHeight</script></body></html>`);
    const height = +execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--dump-dom', 'file://' + h], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/<title>(\d+)/)[1];
    execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', `--force-device-scale-factor=${scale}`, `--window-size=340,${height}`, '--default-background-color=00000000', `--screenshot=${join(outdir, `${id}-${theme}.png`)}`, 'file://' + h], { stdio: 'ignore' });
  }
}
console.log('shots:', ids.length * 2);
