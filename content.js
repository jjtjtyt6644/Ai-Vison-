// content.js — Injected into pages

// On load, check if there's a pending capture to deliver to popup
chrome.runtime.sendMessage({ type: 'CHECK_PENDING_CAPTURE' }, (response) => {
  // No-op: popup handles this itself
});
