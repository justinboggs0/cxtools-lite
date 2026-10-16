// Network helpers: the logged-out error, login page detection, and a small task pool.

/** Procore has logged the user out (HTTP 401, or the request ended on a login page). */
export class LoggedOutError extends Error {
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
export function isLoginUrl(url) {
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
export async function pool(tasks, n, job) {
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
