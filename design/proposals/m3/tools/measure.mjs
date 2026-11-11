// Prints the height of every popup in a states.html gallery (headless Chrome).
// Usage: node tools/measure.mjs <path/to/states.html>
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const file = resolve(process.argv[2]);
const js = `<script>addEventListener('load',()=>{const o=[...document.querySelectorAll('.mr-popup')].map(p=>(p.closest('section[id]')||{}).id+'/'+p.dataset.theme+':'+p.offsetHeight);const pre=document.createElement('pre');pre.id='OUT';pre.textContent=o.join('\\n');document.body.append(pre)})</script>`;
const html = readFileSync(file, 'utf8').replace('<head>', `<head><base href="file://${dirname(file)}/">`).replace('</body>', js + '</body>');
const tmp = join(mkdtempSync(join(tmpdir(), 'm3-')), 'm.html'); writeFileSync(tmp, html);
const dom = execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=3000', '--dump-dom', 'file://' + tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const out = dom.match(/<pre id="OUT">([\s\S]*?)<\/pre>/)[1].split('\n');
for (const l of out) { const h = +l.split(':')[1]; console.log((h > 600 ? 'OVER ' : '     ') + l); }
