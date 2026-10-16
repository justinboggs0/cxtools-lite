// Starts CxTools Lite on the page.

import { DEFAULTS } from './config.js';
import { makeApi } from './api.js';
import { watchRoute } from './route.js';
import { injectStyles } from './ui/styles.js';
import { mountFab } from './ui/fab.js';
import { openDialog } from './ui/dialog.js';

/**
 * Downloads a file through a temporary link.
 * @param {Blob} blob
 * @param {string} name file name
 * @param {Document} [doc=document] the document to create the link in (the report tab passes its own)
 */
function saveFile(blob, name, doc = document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: the browser may still be reading the file.
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

export function main() {
  injectStyles(GM_addStyle);
  const api = makeApi({ fetchImpl: (...a) => fetch(...a) });
  const settings = {
    equipmentConcurrency: DEFAULTS.equipmentConcurrency,
    reportView: GM_getValue('reportView', 'table'),
    onReportView: v => { settings.reportView = v; GM_setValue('reportView', v); },
  };
  let current = null;
  const fab = mountFab({
    doc: document,
    win: window,
    initial: GM_getValue('fabPosition', null),
    savePosition: v => GM_setValue('fabPosition', v),
    onOpen: () => {
      if (current) openDialog({ doc: document, win: window, api, route: { ...current, origin: location.origin }, settings, save: saveFile });
    },
  });
  watchRoute(r => { current = r; fab.sync(r); });
  GM_registerMenuCommand('Reset button position', () => fab.reset());
}

if (typeof GM_getValue === 'function') main();
