// Discoverability helper shared by the popup and the welcome page.

/** True when the OwnTape icon is pinned to the toolbar; null if unknown. */
export async function isPinned() {
  try {
    return Boolean((await chrome.action.getUserSettings()).isOnToolbar);
  } catch {
    return null;
  }
}

/** Shows #pin-hint only when the icon is not pinned. */
export async function renderDiscoverability(doc = document) {
  const pinned = await isPinned();
  const hint = doc.getElementById('pin-hint');
  if (hint) hint.hidden = pinned !== false;
  return { pinned };
}
