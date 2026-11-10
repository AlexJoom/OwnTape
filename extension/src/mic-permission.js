// Microphone permission page. getUserMedia needs a visible extension page for
// the first grant; the offscreen recorder then uses the same permission.
import { PRODUCT_NAME } from './constants.js';

const panels = document.querySelectorAll('[data-status]');

function showPanel(name) {
  for (const panel of panels) panel.hidden = panel.dataset.status !== name;
}

async function permissionState() {
  try {
    return (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    return 'prompt';
  }
}

document.getElementById('btn-allow').addEventListener('click', async () => {
  showPanel('waiting');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    showPanel('granted');
  } catch (err) {
    showPanel(err.name === 'NotAllowedError' ? 'denied' : (await permissionState()) === 'granted' ? 'granted' : 'denied');
  }
});

document.getElementById('btn-close').addEventListener('click', () => window.close());

for (const el of document.querySelectorAll('.js-app-name')) el.textContent = PRODUCT_NAME;
const initial = await permissionState();
if (initial === 'granted' || initial === 'denied') showPanel(initial);
