document.getElementById('open-devtools').addEventListener('click', () => {
  window.close();
});

// Sync version footer with manifest — single source of truth
try {
  const v = browser.runtime.getManifest().version;
  const footer = document.getElementById('popup-version');
  if (footer) footer.textContent = `v${v} · JSON Inspector Extension`;
} catch (_) {}