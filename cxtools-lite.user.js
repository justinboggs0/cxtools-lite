// ==UserScript==
// @name         CxTools Lite
// @namespace    cxtools-lite
// @version      1.0.0
// @description  Printable Equipment Information list for one Procore inspection or a filtered Inspections list.
// @match        https://*.procore.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/justinboggs0/cxtools-lite/main/cxtools-lite.user.js
// @downloadURL  https://raw.githubusercontent.com/justinboggs0/cxtools-lite/main/cxtools-lite.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

// Built from src/ by tools/build.mjs. Edit src/ and run npm run build.
(function () {
'use strict';

// ---------------------------------------------------------------- config
// Fixed numbers and matching rules.

const DEFAULTS = Object.freeze({
  // Inspections read at the same time.
  equipmentConcurrency: 4,
  // Page size for Procore list calls.
  perPage: 500,
});

const CFG = Object.freeze({
  // Section whose answers go into the Equipment list. Must not match "LLE (Long Lead Equipment) Vendor Checks".
  equipmentSection: /^\s*equipment\s+info/i,
  // Inspection custom field shown next to the inspection name (found by its label).
  assetTagLabel: /asset\s*tag/i,
  // Used when the field labels can't be read.
  assetTagFallbackKey: 'custom_field_12501',
});

// ---------------------------------------------------------------- naming
// Small text helpers for file names and CSV.

/**
 * A Windows-safe file name: no reserved or control characters, no trailing dot or space.
 * @param {*} s
 * @param {number} [max=100]
 * @returns {string} never empty ('untitled' when nothing usable is left)
 */
function clean(s, max = 100) {
  const noControl = [...String(s ?? '')].filter(ch => ch.charCodeAt(0) >= 32).join('');
  return noControl
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, '') || 'untitled';
}

/** Today's date as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

/** One quoted CSV cell. */
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

// ---------------------------------------------------------------- endpoints
// Every Procore path this script reads. All are reads; if Procore moves one, fix it here.
// `c` is a route: {companyId, projectId}.

const EP = {
  // The project record (for its name).
  project: c => `/rest/v1.0/projects/${c.projectId}?company_id=${c.companyId}`,
  // One inspection: name, number, status, template, custom fields.
  inspection: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/lists/${id}`,
  // The inspection's sections, in order.
  sections: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/list_sections?filters[list_id]=${id}&sort=position&view=flat_v2`,
  // Every item with its answer.
  items: (c, id) => `/rest/v1.1/projects/${c.projectId}/checklist/list_items?filters[list_id]=${id}&view=extended&sort=position_by_section`,
  // The Inspections list as the list page shows it; the page's filters are added as query parameters.
  groupedIndex: c => `/rest/v1.0/projects/${c.projectId}/checklist/lists/grouped_index`,
  // Labels for the inspection custom fields (custom_field_12501 -> "Asset Tag Plate ID").
  inspectionFieldSets: c => `/rest/v1.0/projects/${c.projectId}/configurable_field_sets?types[]=ConfigurableFieldSet::Checklist::List&include_lov_entries=false`,
};

// ---------------------------------------------------------------- net
// Network helpers: the logged-out error, login page detection, and a small task pool.

/** Procore has logged the user out (HTTP 401, or the request ended on a login page). */
class LoggedOutError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number|null}} [details]
   */
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'LoggedOutError';
    this.status = status;
  }
}

/**
 * True for a sign-in page: Procore's login hosts (login.procore.com, login-xxx.procore.com) or an identity
 * provider on a host of the same form (login.microsoftonline.com).
 * @param {string} url
 * @returns {boolean}
 */
function isLoginUrl(url) {
  try {
    return /^login[.-]/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Runs tasks with at most `n` at once. Stops taking new tasks when the job is cancelled or a task throws;
 * tasks already running finish, then the first error is rethrown.
 * @param {Array<function(): Promise<void>>} tasks
 * @param {number} n
 * @param {{cancelled: boolean}} job
 * @returns {Promise<void>}
 */
async function pool(tasks, n, job) {
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && !job.cancelled && next < tasks.length) {
      const task = tasks[next++];
      try {
        await task();
      } catch (e) {
        failure = failure || { error: e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  if (failure) throw failure.error;
}

// ---------------------------------------------------------------- api
// Procore JSON reads made with the user's own login (same site, cookies included).


// Error messages name the path without its query string.
const pathOnly = path => path.split('?')[0];

/**
 * @param {{fetchImpl: typeof fetch, perPage?: number}} options
 * @returns {{json: Function, all: Function, filteredInspections: Function}} each takes the route ({companyId, projectId}) first
 */
function makeApi({ fetchImpl, perPage = DEFAULTS.perPage }) {
  const init = (ctx, extra = {}) => ({
    credentials: 'include',
    headers: { Accept: 'application/json', 'Procore-Company-Id': ctx.companyId },
    ...extra,
  });
  const loggedOut = path => new LoggedOutError(`Logged out: ${pathOnly(path)} went to a login page`);

  /**
   * @throws {LoggedOutError} on 401 or a login redirect
   * @throws {Error} `HTTP <status> on <path>` (with `.status`) for any other error status; the fetch error when offline
   */
  async function get(ctx, path) {
    let r;
    try {
      r = await fetchImpl(path, init(ctx));
    } catch (e) {
      // A redirect to a login page on another site makes fetch reject instead of returning.
      // Checked by name: in the Tampermonkey sandbox the page's fetch throws the page's TypeError.
      if (e?.name !== 'TypeError') throw e;
      let probe = null;
      try {
        probe = await fetchImpl(path, init(ctx, { redirect: 'manual' }));
      } catch { /* still failing: a real network error */ }
      if (probe?.type === 'opaqueredirect') throw loggedOut(path);
      throw e;
    }
    if (r.redirected && isLoginUrl(r.url)) throw loggedOut(path);
    if (r.status === 401) throw new LoggedOutError(`HTTP 401 on ${pathOnly(path)}`, { status: 401 });
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} on ${pathOnly(path)}`);
      err.status = r.status;
      throw err;
    }
    return r;
  }

  async function bodyOf(r, path) {
    try {
      return await r.json();
    } catch {
      throw new Error(`Response was not JSON: ${pathOnly(path)} returned ${r.headers.get('content-type') || 'no content type'}`);
    }
  }

  /** GET a path and parse its JSON. */
  async function json(ctx, path) {
    return bodyOf(await get(ctx, path), path);
  }

  /** GET every page of a list, until a page adds nothing new or the `total` header is reached. */
  async function all(ctx, path) {
    const out = [];
    const seen = new Set();
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page < 200; page++) {
      const pagePath = `${path}${sep}per_page=${perPage}&page=${page}`;
      const r = await get(ctx, pagePath);
      const batch = await bodyOf(r, pagePath);
      const fresh = (Array.isArray(batch) ? batch : []).filter(x => !seen.has(x.id));
      for (const x of fresh) { seen.add(x.id); out.push(x); }
      const total = Number(r.headers.get('total'));
      if (!fresh.length || (total && out.length >= total)) break;
    }
    return out;
  }

  /**
   * The inspections the Inspections list page shows: the page keeps its filters in the URL, and they are
   * sent again to grouped_index.
   * @param {object} ctx
   * @param {URLSearchParams} search the list page's query string
   * @returns {Promise<Array<object>>} inspection stubs ({id, name, identifier, status, ...}) in number order
   */
  async function filteredInspections(ctx, search) {
    const q = new URLSearchParams();
    // append, not set: a filter with several values repeats its key.
    for (const [k, v] of search) if (k.startsWith('filters[')) q.append(k, v);
    if (search.get('search')) q.set('filters[query]', search.get('search'));
    q.set('view', 'list');
    q.set('sort', 'identifier');
    const rows = [];
    const seen = new Set();
    for (let page = 1; page < 500; page++) {
      q.set('page', page);
      const groups = await json(ctx, `${EP.groupedIndex(ctx)}?${q}`);
      const fresh = (Array.isArray(groups) ? groups : []).flatMap(g => g?.data || []).filter(l => !seen.has(l.id));
      if (!fresh.length) break;
      for (const l of fresh) { seen.add(l.id); rows.push(l); }
    }
    return rows;
  }

  return { json, all, filteredInspections };
}

// ---------------------------------------------------------------- route
// Which Procore page we are on, and a watcher for Procore's in-page navigation.

const ROUTE_RE = /\/webclients\/host\/companies\/(\d+)\/projects\/(\d+)\/tools\/inspections(?:\/(\d+)(?:\/items\/(\d+))?(?:\/.*)?)?\/?$/;

/**
 * @param {string} [href=location.href]
 * @returns {{companyId: string, projectId: string, page: 'inspections'|'inspection', inspectionId: string|null}|null}
 *   null on any page other than the Inspections list or one inspection
 */
function currentRoute(href = location.href) {
  const m = new URL(href).pathname.match(ROUTE_RE);
  if (!m) return null;
  return { companyId: m[1], projectId: m[2], page: m[3] ? 'inspection' : 'inspections', inspectionId: m[3] || null };
}

/**
 * Calls `onChange(route)` now, and again whenever the URL changes.
 * @param {function(ReturnType<typeof currentRoute>): void} onChange
 * @param {{poll?: number, setIntervalImpl?: Function, clearIntervalImpl?: Function, getHref?: function(): string}} [options]
 * @returns {function(): void} stops watching
 */
function watchRoute(onChange, {
  poll = 1000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  getHref = () => location.href,
} = {}) {
  let last = getHref();
  onChange(currentRoute(last));
  const id = setIntervalImpl(() => {
    const href = getHref();
    if (href === last) return;
    last = href;
    onChange(currentRoute(href));
  }, poll);
  return () => clearIntervalImpl(id);
}

// ---------------------------------------------------------------- inspection
// Reads one inspection with its sections and items.


/**
 * @param {{json: Function, all: Function}} api
 * @param {{companyId: string, projectId: string}} ctx
 * @param {string|number} id
 * @returns {Promise<{insp: object, sections: Array<object>, items: Array<object>}>}
 */
async function readInspectionParts(api, ctx, id) {
  const [insp, sections, items] = await Promise.all([
    api.json(ctx, EP.inspection(ctx, id)),
    api.all(ctx, EP.sections(ctx, id)),
    api.all(ctx, EP.items(ctx, id)),
  ]);
  return { insp, sections, items };
}

// ---------------------------------------------------------------- equipment
// The Equipment list: each inspection's "Equipment Information" answers, shown as a printable report (one table
// per template, or one block per inspection) with Print, Copy for OneNote and CSV.


/** Shown in the dialog and the report when Procore has logged the user out. */
const LOGGED_OUT_TEXT = 'Procore logged you out. Log in again, then click the button again.';

/**
 * An item's answer as Procore displays it. responded_with is Procore's own display string ("Hanley",
 * "Sep 5, 2025", "Yes"); unanswered items come back as "No Response", shown blank.
 * @param {{responded_with?: *}} item
 * @returns {string}
 */
const answerOf = item => {
  const v = item.responded_with;
  return v == null || v === 'No Response' ? '' : String(v).trim();
};

/**
 * Text of a custom field. Values are a string, a number, a picked entry ({label}) or a list of picked entries.
 * @param {{value?: *}|undefined} field
 * @returns {string}
 */
function customFieldText(field) {
  const v = field?.value;
  const one = x => (x && typeof x === 'object' ? x.label ?? x.name ?? '' : x ?? '');
  return (Array.isArray(v) ? v.map(one).filter(Boolean).join(', ') : String(one(v))).trim();
}

/**
 * The inspection custom-field keys whose label matches "asset tag" (field labels come from the field-set call).
 * @param {{json: Function}} api
 * @param {object} ctx route
 * @returns {Promise<string[]>} matching keys, or [CFG.assetTagFallbackKey] when none can be read
 * @throws {LoggedOutError} when Procore has logged the user out (the fallback would only hide it)
 */
async function assetTagKeys(api, ctx) {
  try {
    const sets = await api.json(ctx, EP.inspectionFieldSets(ctx));
    const keys = new Set();
    for (const set of sets) {
      for (const [key, f] of Object.entries(set.fields || {})) {
        if (key.startsWith('custom_field_') && CFG.assetTagLabel.test(f.label || '')) keys.add(key);
      }
    }
    if (keys.size) return [...keys];
  } catch (e) {
    if (e instanceof LoggedOutError) throw e;
    /* otherwise fall back below: a read-only user may not see field sets */
  }
  return [CFG.assetTagFallbackKey];
}

/**
 * Equipment Information from an inspection already read (no Procore calls).
 * @param {{insp: object, sections: Array<object>, items: Array<object>}} parts
 * @param {string[]} [assetKeys] from assetTagKeys
 * @returns {{insp: object, fields: Array<{number: *, label: string, value: string}>, assetTag: string, hasSection: boolean, usedSection: string|null}}
 *   usedSection names the fallback section when none is called "Equipment Info..."
 */
function equipmentFromParts({ insp, sections, items }, assetKeys = []) {
  // Equipment Information is section 1 on every QC template; fall back to section 1 if it's named differently.
  let eqSections = sections.filter(s => CFG.equipmentSection.test(s.name || ''));
  const usedFirst = !eqSections.length && sections.length > 0;
  if (usedFirst) eqSections = [[...sections].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]];
  const sectionIds = new Set(eqSections.map(s => s.id));
  const labelCount = new Map();
  const fields = items.filter(i => sectionIds.has(i.section_id)).map(i => {
    // "Receiving Date:" -> "Receiving Date"; a repeated question becomes "Model (2)" so it keeps its own column.
    const base = String(i.name || '').replace(/\s+/g, ' ').trim().replace(/:$/, '') || `Item ${i.number}`;
    const n = (labelCount.get(base) || 0) + 1;
    labelCount.set(base, n);
    return { number: i.number, label: n > 1 ? `${base} (${n})` : base, value: answerOf(i) };
  });
  const assetTag = assetKeys.map(k => customFieldText(insp.custom_fields?.[k])).find(Boolean) || '';
  return { insp, fields, assetTag, hasSection: sectionIds.size > 0, usedSection: usedFirst ? eqSections[0].name : null };
}

/**
 * Reads one inspection's Equipment Information answers.
 * @param {{json: Function, all: Function}} api
 * @param {object} ctx route
 * @param {string|number} id inspection id
 * @param {string[]} [assetKeys] from assetTagKeys
 * @returns {Promise<ReturnType<typeof equipmentFromParts>>}
 * @throws {LoggedOutError} when Procore has logged the user out; other errors when the inspection cannot be read
 */
async function collectEquipment(api, ctx, id, assetKeys = []) {
  return equipmentFromParts(await readInspectionParts(api, ctx, id), assetKeys);
}

/**
 * Groups records by template. Each template asks different questions, so each gets its own table; a group's
 * labels are the union of its records' labels in first-seen order.
 * @param {Array<object>} records collectEquipment results
 * @returns {Array<{template: string, records: Array<object>, labels: string[]}>}
 */
function groupByTemplate(records) {
  const groups = new Map();
  for (const r of records) {
    const key = r.insp.list_template_name || 'Other';
    if (!groups.has(key)) groups.set(key, { template: key, records: [], labels: [] });
    const g = groups.get(key);
    g.records.push(r);
    for (const f of r.fields) if (!g.labels.includes(f.label)) g.labels.push(f.label);
  }
  return [...groups.values()];
}

/** HTML-escapes text for the reports. @param {*} s @returns {string} */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cell = v => (v ? esc(v) : '<span class="nr">—</span>');
/** "Cx-Test Switchgear #7": the inspection as the reports name it. @param {object} insp @returns {string} */
const inspTitle = insp => `${insp.name} #${insp.identifier ?? insp.number ?? insp.id}`;
/**
 * A link to the inspection page. ctx.origin is the Procore origin (location.origin, set by the caller), so links
 * also work in a saved .html file.
 * @param {{companyId: string, projectId: string, origin?: string}} ctx
 * @param {object} insp
 * @returns {string} HTML
 */
const inspLink = (ctx, insp) => {
  const href = `${ctx.origin ?? ''}/webclients/host/companies/${ctx.companyId}/projects/${ctx.projectId}/tools/inspections/${insp.id}`;
  return `<a href="${esc(href)}">${esc(inspTitle(insp))}</a>`;
};

/**
 * One HTML table per template.
 * @param {{companyId: string, projectId: string, origin?: string}} ctx
 * @param {Array<object>} groups groupByTemplate result
 * @returns {string} HTML
 */
function equipmentTables(ctx, groups) {
  return groups.map(g => {
    const head = ['Inspection', 'Asset Tag Plate ID', 'Location', 'Status', ...g.labels].map(x => `<th>${esc(x)}</th>`).join('');
    const rows = g.records.map(r => {
      const byLabel = new Map(r.fields.map(f => [f.label, f.value]));
      const cells = [inspLink(ctx, r.insp), cell(r.assetTag), cell(r.insp.location?.name), cell(r.insp.status), ...g.labels.map(l => cell(byLabel.get(l)))];
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<h2>${esc(g.template)} <small>(${g.records.length})</small></h2><table class="grid"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
}

/**
 * One block per inspection.
 * @param {object} ctx route with origin
 * @param {Array<object>} records collectEquipment results
 * @returns {string} HTML
 */
function equipmentCards(ctx, records) {
  return records.map(r => {
    const sub = [r.insp.list_template_name, r.insp.location?.name, r.insp.status].filter(Boolean).map(esc).join(' · ');
    const rows = [{ label: 'Asset Tag Plate ID', value: r.assetTag }, ...r.fields]
      .map(f => `<tr><th>${esc(f.label)}</th><td>${cell(f.value)}</td></tr>`).join('');
    return `<div class="card"><h3>${inspLink(ctx, r.insp)}</h3><p class="sub">${sub}</p><table class="kv"><tbody>${rows}</tbody></table></div>`;
  }).join('');
}

/**
 * Long-format CSV (one row per answer), with a BOM so Excel opens it as UTF-8.
 * @param {Array<object>} records collectEquipment results
 * @returns {string}
 */
function equipmentCsv(records) {
  const head = ['Template', 'Inspection', 'Asset Tag Plate ID', 'Location', 'Status', 'Item #', 'Field', 'Value'];
  const rows = records.flatMap(r => r.fields.map(f => [
    r.insp.list_template_name, inspTitle(r.insp), r.assetTag, r.insp.location?.name, r.insp.status, f.number, f.label, f.value,
  ]));
  return String.fromCharCode(0xfeff) + [head, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

// Always light: it's meant for paper and OneNote; a dark browser theme would otherwise blank the button labels.
const REPORT_CSS = `
    :root{color-scheme:light}
    body{font:13px/1.4 system-ui,'Segoe UI',sans-serif;color:#232729;margin:0;background:#fff}
    .bar{position:sticky;top:0;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 16px;background:#f6f7f8;border-bottom:1px solid #e3e6e8}
    .bar button{padding:6px 12px;border-radius:4px;border:1px solid #c4cbcf;background:#fff;color:#232729;cursor:pointer;font:inherit}
    .bar button.primary{background:#f47e42;border-color:#f47e42;color:#fff;font-weight:600}
    #msg{color:#1f7a3d}
    #report{padding:16px}
    h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;margin:22px 0 6px} h2 small{font-weight:400;color:#6a767c}
    .meta{color:#6a767c;margin:0 0 8px}
    table{border-collapse:collapse}
    th,td{border:1px solid #aab3b8;padding:4px 7px;text-align:left;vertical-align:top}
    thead th{background:#eef0f1}
    .grid td:first-child{white-space:nowrap}
    .kv{min-width:480px} .kv th{background:#f6f7f8;font-weight:600;width:45%}
    .card{margin:0 0 16px;break-inside:avoid;page-break-inside:avoid}
    .card h3{font-size:14px;margin:0} .card .sub{margin:0 0 4px;color:#6a767c}
    .nr{color:#aab3b8}
    a{color:#1d5fb8;text-decoration:none}
    .notes{margin-top:22px;color:#6a767c} .notes li{margin:2px 0}
    @page{size:landscape;margin:10mm}
    @media print{.bar{display:none} #report{padding:0} body{font-size:11px} tr{page-break-inside:avoid} thead{display:table-header-group}}
  `;

/**
 * Opens the report tab straight from the click so the popup blocker allows it; it is filled once the data is read.
 * @param {Window} opener the page window
 * @returns {Window|null} the new tab, or null when blocked
 */
function openReportWindow(opener) {
  const win = opener.open('', '_blank');
  if (win) {
    win.document.write('<!doctype html><meta charset="utf-8"><title>Equipment list</title>'
      + '<p style="font:14px system-ui,sans-serif;padding:24px">Reading Equipment Information from Procore… '
      + 'Progress shows in the Procore tab.</p>');
  }
  return win;
}

/**
 * The report page HTML.
 * @param {{title: string, subtitle: string, body: string, notes: string[], toolbar: boolean, viewSwitch?: boolean,
 *   extraCss?: string, view?: string}} page body is trusted HTML (built above); title, subtitle and notes are escaped;
 *   viewSwitch (default true) adds the table / cards radios to the toolbar, with `view` (default 'table') checked;
 *   extraCss is appended to the stylesheet
 * @returns {string} a complete HTML document
 */
function reportHtml({ title, subtitle, body, notes, toolbar, viewSwitch = true, extraCss = '', view = 'table' }) {
  const checked = v => (v === view ? ' checked' : '');
  const radios = viewSwitch ? `
        <label><input type="radio" name="view" value="table"${checked('table')}> One table per template</label>
        <label><input type="radio" name="view" value="cards"${checked('cards')}> One block per inspection</label>` : '';
  const bar = toolbar ? `<div class="bar">
        <button id="print" class="primary">Print</button>
        <button id="copy">Copy for OneNote</button>
        <button id="csv">Download CSV</button>${radios}
        <span id="msg"></span>
      </div>` : '';
  const noteList = notes.length ? `<div class="notes"><b>Notes</b><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}${extraCss}</style></head><body>
      ${bar}<div id="report"><h1>${esc(title)}</h1><p class="meta">${esc(subtitle)}</p><div id="view">${body}</div>${noteList}</div></body></html>`;
}

/**
 * Fills the report tab, or saves the report as an .html file when the tab was blocked or closed.
 * @param {Window|null} win the tab from openReportWindow
 * @param {object} ctx route with origin
 * @param {string} projectName
 * @param {Array<object>} records collectEquipment results
 * @param {string[]} notes
 * @param {function(Blob, string, Document=): (void|Promise<void>)} save file saver
 * @returns {Promise<boolean>} true when shown in the tab, false when saved as a file
 */
async function showEquipmentReport(win, ctx, projectName, records, notes, save, { view = 'table', onView = null } = {}) {
  const withSection = records.filter(r => r.hasSection);
  const views = {
    table: equipmentTables(ctx, groupByTemplate(withSection)),
    cards: equipmentCards(ctx, withSection),
  };
  const start = Object.hasOwn(views, view) ? view : 'table';
  return showReport(win, {
    title: `${projectName} - Equipment Information`,
    subtitle: `${withSection.length} inspection(s) · ${new Date().toLocaleString()}`,
    body: views[start], views, view: start, onView, notes, csv: equipmentCsv(withSection),
    fileBase: clean(`${projectName} - Equipment Information - ${today()}`, 150), save,
  });
}

/**
 * Fills a report tab with a page (Print, Copy for OneNote, Download CSV), or saves the page as an .html file when
 * the tab was blocked or closed.
 * @param {Window|null} win the tab from openReportWindow
 * @param {{title: string, subtitle: string, body: string, notes: string[], csv: string, fileBase: string,
 *   save: function(Blob, string, Document=): (void|Promise<void>), views?: Object<string, string>|null, view?: string,
 *   onView?: (function(string): void)|null, extraCss?: string}} page body: the report's HTML; views: alternative bodies
 *   by radio value (the table / cards switch), or none; view: the radio checked at the start; onView: told of a change
 * @returns {Promise<boolean>} true when shown in the tab, false when saved as a file
 */
async function showReport(win, { title, subtitle, body, notes, csv, fileBase, save, views = null, view = 'table', onView = null, extraCss = '' }) {
  // Popup blocked or closed early: save the report as a file instead.
  if (!win || win.closed) {
    await save(new Blob([reportHtml({ title, subtitle, body, notes, toolbar: false, viewSwitch: !!views, extraCss, view })], { type: 'text/html' }), `${fileBase}.html`);
    return false;
  }

  const d = win.document;
  d.open();
  d.write(reportHtml({ title, subtitle, body, notes, toolbar: true, viewSwitch: !!views, extraCss, view }));
  d.close();
  const $ = id => d.getElementById(id);
  const say = t => { $('msg').textContent = t; };
  if (views) {
    d.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => {
      $('view').innerHTML = views[r.value];
      say('');
      try { onView?.(r.value); } catch { /* remembering the view is a nicety */ }
    }));
  }
  $('print').addEventListener('click', () => win.print());
  // Copying a selection keeps the table formatting and links, which is what OneNote pastes best.
  $('copy').addEventListener('click', () => {
    const range = d.createRange();
    range.selectNodeContents($('report'));
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = d.execCommand('copy'); } catch { /* reported below */ }
    sel.removeAllRanges();
    say(ok ? 'Copied. In OneNote, click where it should go and press Ctrl+V.' : 'Copy was blocked. Press Ctrl+A, then Ctrl+C.');
  });
  // The anchor is created in the report tab's own document so the download starts from there.
  $('csv').addEventListener('click', () => save(new Blob([csv], { type: 'text/csv' }), `${fileBase}.csv`, d));
  win.focus();
  return true;
}

/**
 * Reads the selected inspections' Equipment Information and shows the report.
 * If Procore has logged the user out, reading stops and both the dialog and the report say so in one sentence.
 * Never throws for a logout.
 * @param {{json: Function, all: Function}} api
 * @param {object} ctx route with origin
 * @param {Array<{id: *, name?: string}>} stubs selected inspections
 * @param {{status: Function, progress: Function, finish: Function, job: *}} ui dialog reporter
 * @param {Window|null} win report tab from openReportWindow
 * @param {{equipmentConcurrency: number, reportView?: string, onReportView?: function(string): void}} settings
 *   reportView: the view the report opens on ('table' or 'cards'); onReportView: told when the user switches
 * @param {function(Blob, string, Document=): (void|Promise<void>)} save file saver
 * @returns {Promise<void>}
 */
async function runEquipment(api, ctx, stubs, ui, win, settings, save) {
  const job = { cancelled: false };
  ui.job = job;

  let project;
  let assetKeys;
  try {
    project = await api.json(ctx, EP.project(ctx)).catch(e => {
      if (e instanceof LoggedOutError) throw e;
      return { name: `Project ${ctx.projectId}` };
    });
    assetKeys = await assetTagKeys(api, ctx);
  } catch (e) {
    if (!(e instanceof LoggedOutError)) throw e;
    win?.close();
    ui.status(LOGGED_OUT_TEXT);
    ui.finish();
    return;
  }

  const records = new Array(stubs.length);
  const notes = [];
  let loggedOut = false;
  let done = 0;
  ui.progress(0, stubs.length);

  const tasks = stubs.map((stub, idx) => async () => {
    try {
      records[idx] = await collectEquipment(api, ctx, stub.id, assetKeys);
    } catch (e) {
      if (e instanceof LoggedOutError) {
        // Every later read would fail the same way.
        loggedOut = true;
        job.cancelled = true;
      } else {
        notes.push(`Could not read ${stub.name || stub.id}: ${e.message}`);
      }
    }
    ui.progress(++done, stubs.length);
    if (!loggedOut) ui.status(`Reading Equipment Information: ${done} of ${stubs.length} inspections…`);
  });
  await pool(tasks, settings.equipmentConcurrency, job);

  const got = records.filter(Boolean);
  const missing = got.filter(r => !r.hasSection);
  if (missing.length) notes.push(`No sections at all in: ${missing.map(r => inspTitle(r.insp)).join(', ')}`);
  for (const r of got.filter(x => x.usedSection)) {
    notes.push(`${inspTitle(r.insp)} has no "Equipment Information" section, so section 1 ("${r.usedSection}") was used.`);
  }
  if (loggedOut) {
    notes.unshift(LOGGED_OUT_TEXT);
  } else if (job.cancelled) {
    notes.unshift(`Cancelled: only ${got.length} of ${stubs.length} inspections were read.`);
  }

  const opened = await showEquipmentReport(win, ctx, clean(project.name, 80), got, notes, save, { view: settings.reportView || 'table', onView: settings.onReportView || null });
  const found = got.length - missing.length;
  if (loggedOut) {
    ui.status(LOGGED_OUT_TEXT);
  } else {
    ui.status(`${job.cancelled ? 'Cancelled. ' : ''}Equipment list ${opened ? 'opened in a new tab' : 'saved as an .html file (the new tab was blocked or closed)'}: `
      + `${found} inspection(s) with Equipment Information${missing.length ? `, ${missing.length} without` : ''}.`);
  }
  ui.finish();
}

// ---------------------------------------------------------------- main
// Starts CxTools Lite on the page.

function main() {}

})();
