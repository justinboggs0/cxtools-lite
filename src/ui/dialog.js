// The dialog: pick inspections, then make the Equipment list.

import { h } from './dom.js';
import { EP } from '../endpoints.js';
import { LoggedOutError } from '../net.js';
import { LOGGED_OUT_TEXT, inspTitle, openReportWindow, runEquipment } from '../equipment.js';

/**
 * Hides the rows whose text does not contain `text` (case and surrounding spaces ignored).
 * @param {Array<{text: string, hidden: boolean}>} rows text is lower case
 * @param {string} text
 */
export function filterRows(rows, text) {
  const q = text.trim().toLowerCase();
  for (const r of rows) r.hidden = !r.text.includes(q);
}

/**
 * Ticks or unticks every row that is not hidden.
 * @param {Array<{hidden: boolean, checked: boolean}>} rows
 * @param {boolean} checked
 */
export function tickVisible(rows, checked) {
  for (const r of rows) if (!r.hidden) r.checked = checked;
}

/** @returns {string} e.g. '3 of 10 selected' */
export const countText = rows => `${rows.filter(r => r.checked).length} of ${rows.length} selected`;

/** @returns {Array<object>} the data of the ticked rows, in list order */
export const selectedStubs = rows => rows.filter(r => r.checked).map(r => r.data);

/**
 * Opens the dialog for the current page. Does nothing while a run in an open dialog is still going.
 * @param {{doc: Document, win: Window, api: object, route: object, settings: object,
 *   save: function(Blob, string, Document=): void}} options route includes origin
 */
export function openDialog({ doc, win, api, route, settings, save }) {
  const old = doc.getElementById('cxl-overlay');
  if (old?.dataset?.running === '1') return;
  old?.remove();
  const ctx = route;
  const single = route.page === 'inspection';
  let rows = [];
  let running = false;

  const bar = h('div');
  const progressCount = h('div', { class: 'cxl-count' });
  const status = h('div', { class: 'cxl-status' });
  const prog = h('div', { hidden: true }, h('div', { class: 'cxl-bar' }, bar), progressCount, status);
  const eqBtn = h('button', { class: 'cxl-btn cxl-primary', type: 'button' }, 'Equipment list');
  const closeBtn = h('button', { class: 'cxl-btn', type: 'button' }, 'Close');

  const ui = {
    job: null,
    status: t => { status.textContent = t; },
    progress: (d, t) => {
      bar.style.width = `${t ? (100 * d) / t : 0}%`;
      progressCount.textContent = `${d} of ${t} inspections`;
    },
    finish: () => {
      running = false;
      delete overlay.dataset.running;
      closeBtn.textContent = 'Close';
      closeBtn.disabled = false;
    },
  };

  // The list of inspections (list page) or the inspection's name (one inspection).
  let pick;
  let selCount = null;
  const updateCount = () => {
    if (single) return;
    selCount.textContent = countText(rows);
    eqBtn.disabled = !rows.some(r => r.checked);
  };
  const show = () => {
    for (const r of rows) {
      r.el.hidden = r.hidden;
      r.cb.checked = r.checked;
    }
    updateCount();
  };
  if (single) {
    pick = h('div', {}, `Inspection ${route.inspectionId}`);
    api.json(ctx, EP.inspection(ctx, route.inspectionId))
      .then(insp => { if (insp?.name) pick.textContent = inspTitle({ id: route.inspectionId, ...insp }); }, () => {});
  } else {
    const filter = h('input', { type: 'search', placeholder: 'Filter' });
    filter.addEventListener('input', () => { filterRows(rows, filter.value); show(); });
    selCount = h('span', { class: 'cxl-st' });
    const list = h('div', { class: 'cxl-list' }, 'Loading inspections from the current filters…');
    pick = h('div', {},
      h('div', { class: 'cxl-pickbar' }, filter,
        h('button', { class: 'cxl-btn', type: 'button', onclick: () => { tickVisible(rows, true); show(); } }, 'Select all'),
        h('button', { class: 'cxl-btn', type: 'button', onclick: () => { tickVisible(rows, false); show(); } }, 'Select none'),
        selCount),
      list);
    api.filteredInspections(ctx, new URLSearchParams(win.location.search)).then(data => {
      list.textContent = '';
      if (!data.length) {
        list.textContent = 'No inspections match the current filters.';
        return;
      }
      rows = data.map(l => {
        const title = `${l.name} #${l.identifier ?? l.number}`;
        const row = { text: `${title} ${l.status || ''}`.toLowerCase(), hidden: false, checked: true, data: l };
        row.cb = h('input', { type: 'checkbox', checked: true, onchange: () => { row.checked = row.cb.checked; updateCount(); } });
        row.el = h('label', {}, row.cb, h('span', {}, title), h('span', { class: 'cxl-st' }, l.status || ''));
        list.append(row.el);
        return row;
      });
      filterRows(rows, filter.value);
      show();
    }).catch(e => {
      list.textContent = e instanceof LoggedOutError ? LOGGED_OUT_TEXT : `Couldn't load inspections: ${e.message}`;
    });
    updateCount();
  }

  const overlay = h('div', { id: 'cxl-overlay' },
    h('div', { class: 'cxl-box', role: 'dialog', 'aria-label': 'CxTools Lite' },
      h('div', { class: 'cxl-head' },
        h('span', {}, `CxTools Lite · ${single ? 'This inspection' : 'Inspections (current filters)'}`),
        h('button', { class: 'cxl-x', title: 'Close', type: 'button', onclick: () => closeBtn.click() }, '×')),
      h('div', { class: 'cxl-body' }, pick, prog),
      h('div', { class: 'cxl-foot' }, closeBtn, eqBtn)));
  doc.body.append(overlay);

  closeBtn.addEventListener('click', () => {
    if (running) {
      if (ui.job) ui.job.cancelled = true;
      closeBtn.textContent = 'Cancelling…';
      closeBtn.disabled = true;
      return;
    }
    overlay.remove();
  });

  eqBtn.addEventListener('click', () => {
    const stubs = single ? [{ id: route.inspectionId }] : selectedStubs(rows);
    if (!stubs.length) return;
    // Opened before anything is awaited, or the popup blocker stops it.
    const reportWin = openReportWindow(win);
    running = true;
    overlay.dataset.running = '1';
    eqBtn.disabled = true;
    pick.hidden = true;
    prog.hidden = false;
    closeBtn.textContent = 'Cancel';
    runEquipment(api, ctx, stubs, ui, reportWin, settings, save).catch(e => {
      reportWin?.close();
      ui.status(`Stopped: ${e.message}`);
      ui.finish();
    });
  });
}
