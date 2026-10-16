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

// ---------------------------------------------------------------- main
// Starts CxTools Lite on the page.

function main() {}

})();
