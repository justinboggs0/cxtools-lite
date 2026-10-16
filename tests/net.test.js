import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoggedOutError, isLoginUrl, pool } from '../src/net.js';

const newJob = () => ({ cancelled: false });

// Tasks that each wait a moment, so we can count how many run at once.
function gatedTasks(count, state) {
  return Array.from({ length: count }, (_, i) => async () => {
    state.running++; state.max = Math.max(state.max, state.running);
    await new Promise(r => setTimeout(r, 2));
    state.running--; state.done.push(i);
  });
}

test('LoggedOutError carries its status', () => {
  const e = new LoggedOutError('HTTP 401 on /x', { status: 401 });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'LoggedOutError');
  assert.equal(e.status, 401);
  assert.equal(new LoggedOutError('x').status, null);
});

test('pool never runs more than n tasks at once and runs them all', async () => {
  const state = { running: 0, max: 0, done: [] };
  await pool(gatedTasks(10, state), 3, newJob());
  assert.equal(state.max, 3);
  assert.equal(state.done.length, 10);
});

test('pool takes no new task once the job is cancelled', async () => {
  const job = newJob(); let started = 0;
  const tasks = Array.from({ length: 10 }, () => async () => { started++; if (started === 2) job.cancelled = true; });
  await pool(tasks, 1, job);
  assert.equal(started, 2);
});

test('pool rethrows the first task error after in-flight tasks finish, and starts no new ones', async () => {
  let started = 0; let finished = 0;
  const tasks = Array.from({ length: 10 }, (_, i) => async () => {
    started++;
    if (i === 1) throw new LoggedOutError('expired', { status: 401 });
    await new Promise(r => setTimeout(r, 5));
    finished++;
  });
  await assert.rejects(pool(tasks, 2, newJob()), LoggedOutError);
  assert.equal(started, 2);
  assert.equal(finished, 1);
});

test('isLoginUrl recognises Procore and identity-provider login hosts only', () => {
  assert.equal(isLoginUrl('https://login.procore.com/?redirect=x'), true);
  assert.equal(isLoginUrl('https://login-us02.procore.com/'), true);
  assert.equal(isLoginUrl('https://login.microsoftonline.com/abc'), true);
  assert.equal(isLoginUrl('https://app.procore.com/rest/v1.0/projects/2'), false);
  assert.equal(isLoginUrl('https://bucket.s3.amazonaws.com/login.pdf'), false);
  assert.equal(isLoginUrl('not a url'), false);
  assert.equal(isLoginUrl(''), false);
});
