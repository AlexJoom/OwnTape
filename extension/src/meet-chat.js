// Consent aid: writes the user's notice into the Meet chat of the recorded tab.
//
// postChatNotice() is injected with chrome.scripting.executeScript, so it must
// be self-contained (no imports, no outer variables). All Meet selectors live
// in SELECTORS below. Meet has no public DOM API; when Google changes the
// markup, the post fails and the popup shows a warning. It never reports
// success without seeing the message in the chat.
//
// Privacy: the function WRITES only the notice text. The only thing it READS
// is the chat panel's text nodes, to count how often the exact notice text
// occurs (before and after sending). It does not copy, return, store or send
// any chat message, name or other page content. It returns only
// { ok: boolean, step: string } where step is a fixed code word.

export async function postChatNotice(text) {
  const SELECTORS = {
    // Toolbar button that opens the chat panel. data-panel-id is not
    // translated; the aria-label is a fallback for English UIs.
    chatButton: [
      'button[data-panel-id="2"]',
      'button[aria-label*="chat" i][aria-pressed]',
    ],
    // The open side panel.
    panel: ['aside', '[role="complementary"]'],
    // Message field inside the panel (the chat panel has one textarea).
    input: ['textarea'],
    // Send button: language-independent first (the enabled button that comes
    // after the field in the same form), then English labels.
    sendLabels: ['send'],
  };
  const OPEN_TIMEOUT_MS = 5000;
  const VERIFY_TIMEOUT_MS = 5000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => el && el.getClientRects().length > 0;
  const first = (list, root = document) => {
    for (const sel of list) {
      for (const el of root.querySelectorAll(sel)) if (visible(el)) return el;
    }
    return null;
  };
  const waitFor = async (fn, timeout) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };
  const findInput = () => {
    for (const panel of document.querySelectorAll(SELECTORS.panel.join(','))) {
      const input = first(SELECTORS.input, panel);
      if (input) return input;
    }
    return null;
  };
  // Count text nodes in the chat panel that are exactly the notice text.
  // The text of other nodes is compared and then dropped; nothing is kept.
  const countNotice = (root) => {
    if (!root) return 0;
    const target = text.trim();
    let n = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('textarea')) continue;
      if (node.nodeValue.trim() === target) n++;
    }
    return n;
  };
  const findSend = (input) => {
    const scope = input.closest('form') || input.parentElement?.parentElement?.parentElement || document;
    const buttons = [...scope.querySelectorAll('button')].filter((b) => visible(b) && !b.disabled);
    const after = buttons.filter((b) => input.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const labelled = buttons.find((b) =>
      SELECTORS.sendLabels.some((l) => (b.getAttribute('aria-label') || '').toLowerCase().includes(l)),
    );
    return labelled || after[after.length - 1] || null;
  };

  if (!text || !text.trim()) return { ok: false, step: 'empty-text' };

  // 1. Open the chat panel if needed; remember what to restore.
  let input = findInput();
  let restoreButton = null;
  if (!input) {
    const chatButton = first(SELECTORS.chatButton);
    if (!chatButton) return { ok: false, step: 'chat-button-not-found' };
    // Another panel (for example People) can be open; its button is pressed.
    const otherOpen = [...document.querySelectorAll('button[data-panel-id][aria-pressed="true"]')].find(
      (b) => b !== chatButton,
    );
    chatButton.click();
    restoreButton = otherOpen || chatButton;
    input = await waitFor(findInput, OPEN_TIMEOUT_MS);
    if (!input) return { ok: false, step: 'chat-input-not-found' };
  }
  if (input.disabled || input.readOnly) {
    restoreButton?.click();
    return { ok: false, step: 'chat-disabled' };
  }

  const panel = input.closest(SELECTORS.panel.join(','));
  const before = countNotice(panel);

  // 2. Write the text the way typing does, then send.
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, text);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  await sleep(300);
  const send = findSend(input);
  if (send) {
    send.click();
  } else {
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    input.dispatchEvent(new KeyboardEvent('keypress', init));
    input.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  // 3. Verify: one more exact copy of the notice is in the panel.
  const posted = await waitFor(() => countNotice(panel) > before, VERIFY_TIMEOUT_MS);
  if (!posted) {
    // Do not leave a half-written message in the field.
    if (input.value === text) {
      setter.call(input, '');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }));
    }
  }

  // 4. Put the panels back as they were.
  if (restoreButton) {
    await sleep(500);
    restoreButton.click();
  }
  return posted ? { ok: true, step: 'posted' } : { ok: false, step: 'not-verified' };
}
