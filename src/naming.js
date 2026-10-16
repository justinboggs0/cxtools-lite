// Small text helpers for file names and CSV.

/**
 * A Windows-safe file name: no reserved or control characters, no trailing dot or space.
 * @param {*} s
 * @param {number} [max=100]
 * @returns {string} never empty ('untitled' when nothing usable is left)
 */
export function clean(s, max = 100) {
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
export const today = () => new Date().toISOString().slice(0, 10);

/** One quoted CSV cell. */
export const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
