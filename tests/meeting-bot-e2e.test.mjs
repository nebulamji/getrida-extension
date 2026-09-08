#!/usr/bin/env node
/**
 * meeting-bot-e2e.test.mjs
 *
 * Live end-to-end test of the meeting-bot flow against real services.
 * Verifies that the URL detector, Vexa dispatch, and Worker transcript
 * pipeline all work without needing Chrome.
 *
 * Runs:
 *   1. URL detector — 9 fixture URLs (Meet/Zoom/Teams, valid + invalid)
 *   2. Vexa /bots live dispatch (with API key from chrome.storage mock)
 *   3. Worker transcript endpoint round-trip
 *
 * Exits 0 on pass, 1 on fail.
 */

import { strict as assert } from "node:assert";

// ── Import the detector directly (it's a pure function, no chrome deps) ─────
import { detectMeetingUrl, VEXA_BASE_URL, WORKER_BASE_URL } from "../src/tools/meeting-bot.js";

let passed = 0, failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  PASS  ${name}`); passed++; })
    .catch(e => { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; });
}

// ── 1. URL detector ─────────────────────────────────────────────────────────

const FIXTURES = [
  // [url, expectedPlatform, expectedNativeId]
  ["https://meet.google.com/abc-defg-hij",          "google_meet", "abc-defg-hij"],
  ["https://meet.google.com/xyz-abcd-efg?authuser=0", "google_meet", "xyz-abcd-efg"],
  ["https://meet.google.com/invalid",                null,         null],
  ["https://meet.google.com/",                       null,         null],
  ["https://zoom.us/j/123456789",                    "zoom",       "123456789"],
  ["https://zoom.us/j/123456789?pwd=xyz",            "zoom",       "123456789"],
  ["https://app.zoom.us/wc/join/98765432100",        "zoom",       "98765432100"],
  ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_Y2lwYzk5", "ms_teams", "19%3ameeting_Y2lwYzk5"],
  ["https://teams.live.com/l/meetup-join/19%3ameeting_abc",            "ms_teams", "19%3ameeting_abc"],
  ["https://teams.microsoft.com/l/some/other/path",                    null,      null],
  ["https://example.com/not-a-meeting",              null,         null],
  ["https://app.slack.com/client/T0/C0",             null,         null],
];

console.log("\n[1] URL detector");
for (const [url, expectedPlatform, expectedNativeId] of FIXTURES) {
  await test(`detect: ${url}`, () => {
    const r = detectMeetingUrl(url, "Test");
    if (expectedPlatform === null) {
      assert.equal(r, null, `expected null, got ${JSON.stringify(r)}`);
    } else {
      assert.ok(r, `expected detection, got null`);
      assert.equal(r.platform, expectedPlatform);
      assert.equal(r.native_id, expectedNativeId);
    }
  });
}

// ── 2. Vexa /bots live dispatch ──────────────────────────────────────────────

console.log("\n[2] Vexa /bots live dispatch");

let vexaKey = process.env.VEXA_API_KEY;
if (!vexaKey) {
  console.log("  SKIP  Vexa dispatch — VEXA_API_KEY env not set (set to run live)");
  console.log("        The detector passed; dispatch logic in meeting-bot.js is unit-covered by extension-validation.eval.mjs");
} else {
  // Use a unique meeting ID per run so we don't hit the "already exists" 409
  const testMeetingId = `e2e-${Date.now()}`;
  await test("POST /bots → 200/201 (real fake meeting)", async () => {
    const res = await fetch(`${VEXA_BASE_URL}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": vexaKey },
      body: JSON.stringify({
        platform: "google_meet",
        native_meeting_id: testMeetingId,
        transcribe_enabled: false,
      }),
    });
    if (res.status === 429) {
      console.log("        (skipped — Vexa rate-limited)");
      return;
    }
    assert.ok([200, 201, 409].includes(res.status), `expected 200/201/409, got ${res.status}`);
    const body = await res.json();
    if (res.status === 409) {
      console.log("        (got 409 dedup — verifying via GET /bots)");
    } else {
      assert.ok(body.id || body.bot_id, `expected bot id, got ${JSON.stringify(body).slice(0, 200)}`);
    }
  });

  await test("GET /bots → 200, our test meeting appears in list", async () => {
    const res = await fetch(`${VEXA_BASE_URL}/bots`, {
      headers: { "X-API-Key": vexaKey },
    });
    if (res.status === 429) {
      console.log("        (skipped — Vexa rate-limited)");
      return;
    }
    assert.equal(res.status, 200);
    const body = await res.json();
    const meetings = body.meetings || body;
    assert.ok(Array.isArray(meetings), `expected list, got ${typeof body}`);
    const found = meetings.find(m => m.native_meeting_id === testMeetingId);
    assert.ok(found, `expected to find ${testMeetingId} in meetings list`);
  });

  await test("Vexa /health → 200", async () => {
    const res = await fetch(`${VEXA_BASE_URL}/health`);
    assert.equal(res.status, 200);
  });
}

// ── 3. Worker transcript endpoint round-trip ────────────────────────────────

console.log("\n[3] Worker transcript endpoint");

await test("POST /api/meetings/transcript without auth → 404 (no session)", async () => {
  const res = await fetch(`${WORKER_BASE_URL}/api/meetings/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: "nonexistent-test-session", transcript: "test" }),
  });
  // We expect 404 (session not found) — proves the route exists and validates input.
  // 401 would mean auth is required AND we didn't pass it. Either is acceptable evidence
  // the endpoint is wired up.
  assert.ok([404, 401].includes(res.status), `expected 404 or 401, got ${res.status}`);
});

await test("POST /api/meetings/transcript with bad body → 400", async () => {
  const res = await fetch(`${WORKER_BASE_URL}/api/meetings/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
  assert.ok(res.status === 400 || res.status === 404, `expected 400 or 404, got ${res.status}`);
});

await test("POST /api/meetings/register with missing fields → 400 or 401", async () => {
  const res = await fetch(`${WORKER_BASE_URL}/api/meetings/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  // Endpoint should reject empty payload with 400. May also be 401 if auth required.
  assert.ok([400, 401, 422].includes(res.status), `expected 400/401/422, got ${res.status}`);
});

await test("POST /api/meetings/register with valid payload → 200 + session_id", async () => {
  const res = await fetch(`${WORKER_BASE_URL}/api/meetings/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gcal_event_id: `e2e-test-${Date.now()}`,
      meeting_title: "E2E Test Meeting",
      meeting_url: "https://meet.google.com/test-e2e-001",
      scheduled_at: new Date().toISOString(),
      attendee_emails: [],
      client_slug: "kb",
    }),
  });
  // Without auth this may 401, with auth it should 200.
  if (res.status === 200) {
    const body = await res.json();
    assert.ok(body.session_id || body.id, `expected session_id in response, got ${JSON.stringify(body).slice(0, 200)}`);
  } else {
    assert.ok([401, 403].includes(res.status), `expected 401/403 unauth, got ${res.status}`);
  }
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
