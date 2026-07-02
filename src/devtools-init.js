/**
 * devtools-init.js — runs in the devtools page context.
 * Creates the "JSON Inspector" panel in browser devtools.
 */
browser.devtools.panels.create(
  'JSON Inspector',
  '/icons/icon16.png',
  '/src/panel.html',
  () => {}
);
