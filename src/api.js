// Procore JSON reads made with the user's own login (same site, cookies included).

import { EP } from './endpoints.js';
import { DEFAULTS } from './config.js';
import { LoggedOutError, isLoginUrl } from './net.js';

// Error messages name the path without its query string.
const pathOnly = path => path.split('?')[0];

/**
 * @param {{fetchImpl: typeof fetch, perPage?: number}} options
 * @returns {{json: Function, all: Function, filteredInspections: Function}} each takes the route ({companyId, projectId}) first
 */
export function makeApi({ fetchImpl, perPage = DEFAULTS.perPage }) {
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
