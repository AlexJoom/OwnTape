// Discoverability helpers shared by the popup and the welcome page.

export const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

/**
 * The real keyboard shortcut that opens OwnTape ("" when none is set: the
 * user removed it, or another extension already uses the key).
 */
export async function openShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    return commands.find((c) => c.name === '_execute_action')?.shortcut || '';
  } catch {
    return '';
  }
}

/** True when the OwnTape icon is pinned to the toolbar; null if unknown. */
export async function isPinned() {
  try {
    return Boolean((await chrome.action.getUserSettings()).isOnToolbar);
  } catch {
    return null;
  }
}

/**
 * Fills the shared hooks: #shortcut-line + #shortcut-key, #shortcut-none +
 * #btn-shortcut-set, #pin-hint. Returns what it showed.
 */
export async function renderDiscoverability(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const [shortcut, pinned] = await Promise.all([openShortcut(), isPinned()]);
  if ($('shortcut-key')) $('shortcut-key').textContent = shortcut;
  if ($('shortcut-line')) $('shortcut-line').hidden = !shortcut;
  if ($('shortcut-none')) $('shortcut-none').hidden = Boolean(shortcut);
  if ($('pin-hint')) $('pin-hint').hidden = pinned !== false;
  const button = $('btn-shortcut-set');
  if (button && !button.dataset.wired) {
    button.dataset.wired = '1';
    // chrome:// pages cannot be opened with a link from an extension page.
    button.addEventListener('click', () => chrome.tabs.create({ url: SHORTCUTS_URL }));
  }
  return { shortcut, pinned };
}
