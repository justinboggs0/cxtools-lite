// Which Procore page we are on, and a watcher for Procore's in-page navigation.

const ROUTE_RE = /\/webclients\/host\/companies\/(\d+)\/projects\/(\d+)\/tools\/inspections(?:\/(\d+)(?:\/items\/(\d+))?(?:\/.*)?)?\/?$/;

/**
 * @param {string} [href=location.href]
 * @returns {{companyId: string, projectId: string, page: 'inspections'|'inspection', inspectionId: string|null}|null}
 *   null on any page other than the Inspections list or one inspection
 */
export function currentRoute(href = location.href) {
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
export function watchRoute(onChange, {
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
