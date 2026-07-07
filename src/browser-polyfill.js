// Cross-browser shim: Firefox exposes the promise-based `browser` global,
// Chrome (MV3) only exposes the callback-based `chrome` global.
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  self.browser = chrome;
}
