// Tab Hibernator Pro — DEV Edition · content script
// Runs on every http(s) page. Tracks unsaved form input so the background
// never freezes a tab where you're mid-edit, and reports/restores scroll.
(() => {
  if (window.__thpContentLoaded) return;
  window.__thpContentLoaded = true;

  let formDirty = false;

  function markDirty() { formDirty = true; }

  // Consider the page "dirty" if any editable field has content the user typed.
  function computeDirtyOnDemand() {
    if (formDirty) return true;
    const fields = document.querySelectorAll(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
    );
    for (const el of fields) {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      if (el.isContentEditable && el.textContent.trim()) return true;
      if ('value' in el && typeof el.value === 'string') {
        const def = el.defaultValue ?? '';
        if (el.value && el.value !== def) return true;
      }
      if (el.tagName === 'SELECT' && el.selectedIndex > 0) {
        // only count as dirty if a checkbox/radio-like change; skip selects to
        // avoid false positives — most selects have a default selection
      }
    }
    return false;
  }

  document.addEventListener('input', markDirty, { capture: true, passive: true });
  document.addEventListener('change', markDirty, { capture: true, passive: true });

  // On (re)load, ask the background whether it stashed a scroll position for
  // this tab when it was hibernated, and if so jump back to it.
  function tryRestoreScroll() {
    try {
      chrome.runtime.sendMessage({ type: 'THP_getPendingScroll' }, (resp) => {
        if (chrome.runtime.lastError) return;
        const y = resp && resp.scrollY;
        if (typeof y === 'number' && y > 0) {
          window.scrollTo(0, y);
          // second pass after late layout/content settles
          setTimeout(() => window.scrollTo(0, y), 400);
        }
      });
    } catch { /* extension context may be gone */ }
  }
  if (document.readyState === 'complete') tryRestoreScroll();
  else window.addEventListener('load', tryRestoreScroll, { once: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'THP_getState') {
      sendResponse({
        dirty: computeDirtyOnDemand(),
        scrollY: window.scrollY || window.pageYOffset || 0,
      });
      return true;
    }
    return false;
  });
})();
