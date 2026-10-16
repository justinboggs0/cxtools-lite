// Styles for the button and the dialog. Every rule is scoped under #cxl-fab or #cxl-overlay.
// The button sits lower than the full CxTools buttons so both can be seen when both are installed.

/** The stylesheet. */
export const CSS = `
    #cxl-fab{position:fixed;right:24px;bottom:90px;z-index:2147483000;background:#f47e42;color:#fff;border:0;border-radius:22px;
      padding:10px 16px;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;touch-action:none;user-select:none}
    #cxl-fab:hover{background:#e0692c}
    #cxl-fab.cxl-dragging{cursor:grabbing;opacity:.85}
    #cxl-fab.cxl-collapsed{padding:8px 9px;border-radius:14px;font-size:14px}
    #cxl-fab[hidden],#cxl-overlay [hidden]{display:none !important}
    #cxl-overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}
    #cxl-overlay .cxl-box{background:#fff;color:#232729;width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:flex;flex-direction:column;
      border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:13px/1.4 system-ui,sans-serif}
    #cxl-overlay .cxl-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 18px;border-bottom:1px solid #e3e6e8;font-weight:600;font-size:15px}
    #cxl-overlay .cxl-x{border:0;background:none;font-size:22px;cursor:pointer;color:#6a767c}
    #cxl-overlay .cxl-body{padding:14px 18px;overflow:auto;display:flex;flex-direction:column;gap:12px;min-height:0}
    #cxl-overlay .cxl-pickbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #cxl-overlay .cxl-pickbar input{flex:1;min-width:160px;padding:6px 8px;border:1px solid #c4cbcf;border-radius:4px}
    #cxl-overlay .cxl-list{border:1px solid #e3e6e8;border-radius:4px;max-height:300px;overflow:auto}
    #cxl-overlay .cxl-list label{display:flex;gap:8px;padding:5px 8px;border-bottom:1px solid #f1f3f4;align-items:center}
    #cxl-overlay .cxl-st{margin-left:auto;color:#6a767c;font-size:12px;white-space:nowrap}
    #cxl-overlay .cxl-bar{height:8px;background:#e3e6e8;border-radius:4px;overflow:hidden}
    #cxl-overlay .cxl-bar div{height:100%;width:0;background:#f47e42;transition:width .2s}
    #cxl-overlay .cxl-count{margin-top:6px;color:#4d5559;font-size:12px}
    #cxl-overlay .cxl-status{margin-top:2px;word-break:break-word}
    #cxl-overlay .cxl-foot{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:12px 18px;border-top:1px solid #e3e6e8}
    #cxl-overlay button.cxl-btn{padding:7px 14px;border-radius:4px;border:1px solid #c4cbcf;background:#fff;cursor:pointer;font:inherit}
    #cxl-overlay button.cxl-primary{background:#f47e42;border-color:#f47e42;color:#fff;font-weight:600}
    #cxl-overlay button:disabled{opacity:.5;cursor:default}
  `;

/**
 * Adds the stylesheet to the page.
 * @param {function(string): void} addStyle GM_addStyle
 * @returns {void}
 */
export function injectStyles(addStyle) {
  addStyle(CSS);
}
