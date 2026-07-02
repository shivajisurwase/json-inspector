// ─── Boot ─────────────────────────────────────────────────────────────────────

// Sync version badge with manifest — single source of truth
try {
  const v = browser.runtime.getManifest().version;
  const badge = document.getElementById('logo-version');
  if (badge) badge.textContent = `v${v}`;
} catch (_) {}

updateHighlight();
renderStateView();
