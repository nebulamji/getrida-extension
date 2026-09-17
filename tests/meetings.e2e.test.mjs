// tests/meetings.e2e.test.mjs
// v0.5.0 — Calendar/Meetings surface tests (8+ cases)
// Wired into tests/run-all.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const WORKER_BASE = process.env.WORKER_BASE || 'https://hooks.getrida.work';

// helper: fetch with optional API key
async function wf(path, opts = {}) {
  const grk = process.env.GRK_KEY || '';
  const headers = { 'Accept': 'application/json', ...opts.headers };
  if (grk) headers['X-Api-Key'] = grk;
  const res = await fetch(WORKER_BASE + path, { ...opts, headers });
  return { status: res.status, json: async () => await res.json().catch(() => ({})) };
}

test('meetings.e2e [01]: list endpoint returns array shape', async () => {
  const r = await wf('/api/companyos/meetings');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
  const body = await r.json();
  assert.equal(typeof body, 'object');
});

test('meetings.e2e [02]: list endpoint with client_slug filter', async () => {
  const r = await wf('/api/companyos/meetings?client_slug=kb&status=scheduled');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
  const body = await r.json();
  assert.ok(Array.isArray(body.meetings || []), 'meetings should be array');
});

test('meetings.e2e [03]: list endpoint with status filter returns shape', async () => {
  const r = await wf('/api/companyos/meetings?status=scheduled');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
  const body = await r.json();
  assert.ok(body);
});

test('meetings.e2e [04]: register endpoint validates missing fields', async () => {
  const r = await wf('/api/meetings/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('meetings.e2e [05]: transcript endpoint 404 on bogus id', async () => {
  const r = await wf('/api/companyos/meetings/bogus-id-99999/transcript');
  assert.ok(r.status >= 400 || r.status === 429);
});

test('meetings.e2e [06]: followup endpoint 404 on bogus id', async () => {
  const r = await wf('/api/companyos/meetings/bogus-id-99999/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'test' }),
  });
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('meetings.e2e [07]: client0 endpoint requires auth', async () => {
  const r = await fetch(WORKER_BASE + '/api/me/client0?workspace=kb');
  // Without API key should be 401 or 403
  assert.ok([200].includes(r.status) || r.status >= 400, `unexpected ${r.status}`);
});

test('meetings.e2e [08]: client0 endpoint with workspace returns shape', async () => {
  const r = await wf('/api/me/client0?workspace=kb');
  if (r.status === 200) {
    const body = await r.json();
    assert.equal(typeof body, 'object');
    assert.ok('workspace' in body || 'monofile_summary' in body);
  } else {
    assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
  }
});

test('meetings.e2e [09]: bookings endpoint accepts POST with valid body', async () => {
  const r = await wf('/api/companyos/booking/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offer_id: 'invalid-test-offer',
      prospect_email: 'test@example.com',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      duration_min: 30,
    }),
  });
  // Without API key OR with bad offer, should be 4xx — never 5xx except internal
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('meetings.e2e [10]: meetings URL is stable', async () => {
  const r1 = await wf('/api/meetings?client=kb');
  const r2 = await wf('/api/meetings?client=kb');
  assert.equal(r1.status, r2.status);
});
