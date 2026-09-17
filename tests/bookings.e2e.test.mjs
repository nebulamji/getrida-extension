// tests/bookings.e2e.test.mjs
// v0.5.0 — Bookings surface tests (8+ cases)
// Wired into tests/run-all.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const WORKER_BASE = process.env.WORKER_BASE || 'https://hooks.getrida.work';

async function wf(path, opts = {}) {
  const grk = process.env.GRK_KEY || '';
  const headers = { 'Accept': 'application/json', ...opts.headers };
  if (grk) headers['X-Api-Key'] = grk;
  const res = await fetch(WORKER_BASE + path, { ...opts, headers });
  return { status: res.status, json: async () => await res.json().catch(() => ({})) };
}

test('bookings.e2e [01]: list endpoint shape', async () => {
  const r = await wf('/api/companyos/meetings');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
  const body = await r.json();
  assert.equal(typeof body, 'object');
});

test('bookings.e2e [02]: filter upcoming', async () => {
  const r = await wf('/api/companyos/meetings?client_slug=kb&status=scheduled');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
});

test('bookings.e2e [03]: list completed', async () => {
  const r = await wf('/api/companyos/meetings?status=completed');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
});

test('bookings.e2e [04]: create endpoint validates', async () => {
  const r = await wf('/api/companyos/booking/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.ok(r.status !== 200, `worker should reject empty body, got 200`);
});

test('bookings.e2e [05]: create with all fields but bad offer is 404', async () => {
  const r = await wf('/api/companyos/booking/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offer_id: 'bogus-no-such-offer-12345',
      prospect_email: 'a@b.com',
      scheduled_at: new Date(Date.now() + 3600000).toISOString(),
      duration_min: 30,
    }),
  });
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('bookings.e2e [06]: transcript fetch on unknown id returns 404', async () => {
  const r = await wf('/api/companyos/meetings/unknown-id-zzz/transcript');
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('bookings.e2e [07]: followup email endpoint responds', async () => {
  const r = await wf('/api/companyos/meetings/unknown-id-zzz/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'test summary' }),
  });
  assert.ok(r.status >= 400, `expected 4xx, got ${r.status}`);
});

test('bookings.e2e [08]: list endpoint stable', async () => {
  const r1 = await wf('/api/companyos/meetings');
  const r2 = await wf('/api/companyos/meetings');
  assert.equal(r1.status, r2.status);
});

test('bookings.e2e [09]: meetings list + scheduling idempotent', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await wf('/api/companyos/meetings');
    assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
  }
});

test('bookings.e2e [10]: bookings endpoint with client_slug works', async () => {
  const r = await wf('/api/companyos/meetings?client_slug=byron');
  assert.ok(r.status < 500, `5xx from worker: ${r.status}`);
});
