# Changelog
## [0.5.1] - 2026-09-26

- Approvals in the side panel: drafts your employee wants to send (to, from, subject, preview) with Approve and send / Don't send. Refreshes every minute; edit in the workspace.

## [0.5.0] - 2026-09-26

- Meet notes: asks once, captures the call's captions, and sends the transcript to your employee at call end for a recap, follow-ups and documents.

## [0.4.3] - 2026-09-24

- "Finish setting up your workspace" banner until portal onboarding is complete.

## [0.4.2] - 2026-09-24

- New "Connect your GetRida key" card and a GetRida key field in Settings. The key is checked against your account before it is saved.

## [0.4.1] - 2026-09-24

- Works with keys from getrida.work/start and from Stripe checkout (backend now accepts both).
- Agent replies in plain client language.
- Memory and Integrations tabs authenticate with your grk_ key.
- Welcome screen no longer names internal infrastructure.


## [Unreleased]

### Added — Meeting-bot layer (Vexa integration, in-progress; not shipped as a release)
- **`src/tools/meeting-bot.js`** (NEW) — Vexa dispatch + state tracking + webhook config
  - `detectMeetingUrl(url, title)` — inline detector for Google Meet (`meet.google.com/abc-defg-hij`), Zoom web (`zoom.us/j/MEETING_ID` + `app.zoom.us/wc/join/...`), MS Teams (`teams.microsoft.com/l/meetup-join/...`)
  - `dispatchVexaBot(platform, native_id, ...)` — POSTs to `vexa.artofficial.computer/bots`, handles 409 (already-dispatched) idempotently
  - `setVexaWebhook(url)` — PUT to `vexa.artofficial.computer/user/webhook`, points Vexa at Worker `/api/meetings/transcript`
  - **`registerWorkerSession(meeting)`** — POSTs to `hooks.getrida.work/api/meetings/register` BEFORE dispatching the bot. Without this, the transcript webhook returns 404 ("session not found") because there's no `meeting_sessions` row to attach to.
  - State machine in `chrome.storage.local[getrida_meeting_state]` — `{ active, history[20], webhook_set }`
  - Idempotency: if active meeting matches, returns cached bot_id instead of re-dispatching
- **`content.js` extended** — runs `detectAndReportMeeting()` on initial page load AND on SPA navigation (Meet/Teams are SPAs that change URL without reload). Sends `meetingDetected` message to background SW.
- **`background.js` extended** — 5 new message handlers:
  - `meetingDetected` → dispatch Vexa bot, broadcast `meetingBotDispatched` to popup
  - `getActiveMeeting` / `getMeetingHistory` / `clearActiveMeeting`
  - `ensureMeetingWebhook` — one-time webhook setup pointing at Worker transcript endpoint
- **Popup UI extended** — new "Meeting Bot" section above stats:
  - Status dot + label (idle / active / error)
  - Last 5 dispatch history with platform label + timestamp
  - Auto-refreshes every 3 seconds while popup is open
- **`tests/meeting-bot-e2e.test.mjs`** (NEW) — 17 tests covering URL detector (12 fixtures) + Worker round-trip + Vexa API paths. Wired into `tests/run-all.mjs`.
- **`tests/meeting-bot-live-e2e.sh`** (NEW) — bash script for live integration testing against real services. Sources `VEXA_API_KEY` from `~/gavel/scripts/vexa-bot-dispatcher.sh`.

### Note
The meeting-bot layer is on disk and tested (6/6 eval suites pass when bumped to a future release version) but **NOT released** as a v0.5.0. The v0.4.0 build remains the canonical release. A v0.5.0 release requires a v0.5.0 spec (per the BUILD-PLAN-v0.1 Frontier F0-F13 doctrine) covering the full extension = employee = calendar + Zoom + booking + client0 context rail surface, not just the meeting-bot.

## [0.4.0] - 2026-07-27

### Added — Onboarding, agent bootstrapping, Gemini, receipt tracking
- **First-run capability scan** — on install, extension scans open tabs, detects wallet providers (`window.ethereum` / `window.solana`), matches skill domain patterns, and writes a machine-readable `getrida_capabilities` manifest to `chrome.storage.local`.
- **Welcome flow** — side panel shows detected services + wallet provider on first open with "Connect Wallet" and "Skip" buttons. No more blank-first-open.
- **Agent-bootstrappable config** — external agents (Claude, Codex, Hermes, OpenClaw) can fully configure the extension via `chrome.runtime.sendMessage({ action: 'setAgentConfig', config: {...} })` — one call sets mode, provider, wallet, and endpoint. Agents query capabilities via `getCapabilities` message or `chrome.storage.local.get('getrida_capabilities')`.
- **Wallet provider auto-detection** — wallet connect now detects MetaMask/Phantom automatically. No more `prompt()` for address entry. Falls back to inline address input when no provider detected.
- **Wallet inline UX** — challenge text displayed inline in the side panel, signature entered in an input field. Zero `prompt()` calls remain in the entire extension. Connect/Verify split into two-step button flow.
- **Cancel/stop button** — agent runs can be interrupted. Stop button replaces send while running. Agent loop checks `AbortSignal` between iterations. Returns `stopped: true` with a "[Stopped by user.]" message.
- **Gemini provider** — real `callGemini()` implementation with full OpenAI→Gemini format conversion (contents, functionDeclarations, systemInstruction) and response parsing (candidates, parts, functionCall). Added to provider dropdown.
- **Collapsible receipt viewer** — Wallet tab shows last 20 Lamport receipts (timestamp, action, target). Toggle visibility.
- **Auto-agent wallet detection** — `detectWallet` and `connectWalletProvider` messages available for agent-mediated wallet connection.

### Changed — Security, skills, parity
- **`evaluate()` now runs in ISOLATED world** — no longer executes LLM-generated code in page MAIN context. `evaluatePage()` added for MAIN-world DOM reads, gated by user confirmation (code preview + Approve/Deny).
- **Skill injection migrated to `chrome.userScripts` API** — skills register once at install time and auto-inject on matching domains. Removed DOM `appendChild` injection from content script. The `userScripts` permission is now exercised.
- **Skills default timestamps fixed** — 24 `new Date().toISOString()` calls replaced with hardcoded `2026-07-11T00:00:00.000Z` (v0.3.0 authorship date). User-created skills still get live timestamps.
- **Free-tier wallet forwarding parity** — side panel compile now sends `walletAddress`/`walletChain` (was only popup before). Both UI surfaces forward wallet identity to the compile endpoint.
- **Side panel wallet forwarding** — side panel compile flow now passes wallet payload on all sends.

### Fixed
- Fixes original gap audit (HEL-SPEC-EXT-1.0) — 7 of 10 architecture/security gaps closed in this release.
- `setAgentConfig` handler properly structured as a non-async message listener.
- Agent loop handles undefined abbreviation gracefully.

## [0.3.2] - 2026-07-26

### Added — Envoy / EmailOS integration (gavel 20260726T230000Z doctrine)
The agent loop now understands the governed-outbound intelligence from the gavel Envoy handoff:
- SYSTEM_PROMPT carries the three doctrine items: D1 (identity is a platform guarantee), D2 (alert = Lamport proof), D3 (pipe = ontology made executable)
- 6 new agent tools (`envoy_*`): `envoy_gate_status`, `envoy_draft`, `envoy_classify_reply`, `envoy_receipt_chain`, `envoy_tristate`, `envoy_identity_resolve`
- `envoy_tristate` is a LOCAL scorer (+1/0/-1) — no API. Standing quality gate on client-facing copy (V5.1 + V6 tristate doctrine)
- `envoy_identity_resolve` uses the LIVE `/api/v1/x402/status` path to prove D1 for the active wallet
- `envoy_receipt_chain` uses the live `/api/v1/a2a/inbox` until Envoy Phase 1.0 deploys
- All other envoy tools gracefully degrade with `gate: 'envoy_backend_not_deployed'` until G1/G2/G3 + treasury ATA clear — the gap IS the signal (D2)
- New `src/tools/envoy-tools.js` (parallel to browser-tools.js)
- New `src/tools/agent-receipts.js` — Lamport receipt emitter. Every state-changing tool call appends an immutable 9-field receipt (actor, authority, source, action, target, input_hash, output_hash, timestamp, evidence_refs) to `chrome.storage.local[getrida_agent_receipts]`. The conversation IS the receipt chain (D2/D3 in code)
- 3 new default skills: `getrida-portal` (portal.getrida.work + portalv2.getrida.work), `getrida-envoy` (envoy.getrida.work — gate-aware), `getrida-market` (market.getrida.work — GRK metering)
- NEVER-SEND rule in SYSTEM_PROMPT: agent recommends, never sends. G2 gate governs observer → sender-of-record transition
- 2 new test suites: `tests/envoy-integration.invariants.eval.mjs` (14 invariants), `tests/agent-loop.invariants.eval.mjs` upgraded to scan envoy-tools.js too

## [0.3.1] - 2026-07-15 (reconciled 2026-07-26)

### Changed (Jul 15 drift — previously unreceipted, recovered 2026-07-26)
- Free-tier compile flow now forwards `walletAddress` / `walletChain` to `/api/v1/compile` when a wallet is set (`background.js handleCompile`)
- Popup reads `WALLET_KEY` and shows a gold "CONNECTED" badge when a wallet address is present (`popup.js`, `popup.html`)
- `PROVIDER_KEY` storage scaffolded on install (default `{ mode: 'byok', provider: 'openai', apiKey: '' }`) — no UI consumes it yet
- Stale-deadline guard in popup render: capturing/compiling state older than 120s flips to error "Compile timed out. The LLM may be overloaded."

### Fixed (2026-07-26)
- `popup.js` history panel rendered `undefined tabs` for every past session — `loadHistory` read `s.tabs` but `saveSession` stores `tabCount`. Now reads `s.tabCount`.
- Manifest version bumped 0.3.0 → 0.3.1 to match this CHANGELOG entry.
- `declarativeNetRequest` permission removed — redundant with `chrome.debugger` already used for network watch.
- `host_permissions` trimmed: specific entries (`getrida.work/*`, OpenAI, Anthropic, Google, NVIDIA, AgentMail) removed; `<all_urls>` covers all. Web Store reviewer-friendly.

### Future-scoped permissions (declared, not yet used)
- `userScripts` — slated for v0.4 skill-injection upgrade (replaces current DOM-appendChild hack in `content.js injectSkills`)
- `tabGroups` — slated for v0.4 orchestrator (#13 in F5 spec): parallel subagent tabs need color badges for visual dispatch grouping

## [0.3.0] - 2026-07-11

### Added
- Wallet auth: SIWE on Base, Solana sign — wallet IS the login (no password)
- Wallet tab in side panel: address, chain, authority level, spend cap, confidence
- World tab in side panel: workspace state, items, quests with progress bars
- 6-tab navigation: Compile, Agent, Skills, Wallet, World, Settings
- Wallet connect flow: challenge → sign → verify → session token
- Wallet disconnect support in Settings
- x402 endpoint integration (fetch authority level and spend cap)
- Workspace state reader via /api/v1/world endpoint

### Worker Endpoints (shipped)
- POST /api/auth/challenge — SIWE/Solana challenge generation
- POST /api/auth/verify — signature verification + session issuance
- POST /api/auth/wallet/link — link wallet to workspace identity
- GET /api/auth/session — validate wallet session
- POST /api/v1/x402/activate — Base/Solana USDC payment verification
- GET /api/v1/x402/status — steward wallet addresses + activation cost
- POST /api/v1/a2a/send — A2A email dispatch (enjoy@ → rida@)
- GET /api/v1/a2a/inbox — agent inbox reader
- GET /api/v1/world — workspace world state + items + quests
- POST /api/v1/quest/action — start/complete/progress quests
- POST /api/v1/trade/action — item transfer between workspaces

### D1 Migrations Applied
- 0002: steward_wallets, agent_authority_receipts, companyos_services
- 0081: wallet_authority_gates + wallet_authority_gate_events
- 0082: world_state, world_items, quest_progress, party_state, trade_zone_events

### Worker Modules Created
- src/walletAuth.ts — wallet authentication (SIWE + Solana)
- src/x402Settlement.ts — on-chain USDC payment verification
- src/walletAuthorityGates.ts — deterministic confidence → wallet authority
- src/a2aApi.ts — A2A email dispatch and inbox
- src/metaverseApi.ts — world state, quests, trades

## [0.2.0] - 2026-07-11

### Added
- Paid tier: full agentic browser — navigate, click, type, press, scroll, screenshot, evaluate, waitFor
- Paid tier: agent loop with LLM tool-call execution
- Paid tier: skills system — 9 built-in skills
- Content script: element picker, action overlay, skill injection
- Sandbox page for CSP-compliant JS execution

## [0.1.0] - 2026-07-11

### Added
- Free tier: tab compilation via public Worker endpoint
- Free tier: KEEP vs CLOSE noise tab identification
- Session history in IndexedDB
- Page type classification