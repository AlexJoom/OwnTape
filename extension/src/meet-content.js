// Content script on meet.google.com. Read-only: it does not change the page.
// It tells the service worker when the user leaves the call, so the recording
// stops cleanly. The worker ignores this message unless this tab is recorded.
//
// Meet markup is not a public API. The "leave call" button is the signal; if
// Google changes it, this detection stops working, but recording still works
// and stops when the tab closes or leaves the meeting URL.
(() => {
  const LEAVE_BUTTON = '[jsname="CQylAd"], button[aria-label*="leave call" i]';
  const POLL_MS = 2000;
  const MISSES_TO_END = 2;

  let wasInCall = false;
  let misses = 0;

  const timer = setInterval(() => {
    const inCall = document.querySelector(LEAVE_BUTTON) !== null;
    if (inCall) {
      wasInCall = true;
      misses = 0;
      return;
    }
    if (!wasInCall) return;
    misses += 1;
    if (misses >= MISSES_TO_END) {
      wasInCall = false;
      misses = 0;
      chrome.runtime.sendMessage({ target: 'sw', type: 'meetCallEnded' }).catch(() => {
        // The extension was reloaded or removed; stop polling.
        clearInterval(timer);
      });
    }
  }, POLL_MS);
})();
