# GetRida.Work Chrome Extension

**Compile your tabs into mission reports. Close the noise. Upgrade to full workspace agent.**

## Two Tiers

### Free — GetRida Compiler (AGPL-3.0, open source)

- Write a one-sentence mission
- Agent scans every open tab, extracts structured signal
- Returns: SUMMARY, FINDINGS, NEXT ACTIONS, KEEP vs CLOSE
- One-click close noise tabs
- Session history in local IndexedDB
- **Meeting bot** — detects Meet/Zoom-web/Teams URLs and dispatches a Vexa bot to join + transcribe (pop-up status panel shows active bot + last 5 dispatches)
- No auth, no account, no setup

### Paid — GetRida Agent (proprietary, GetRida workspace gated)

- Everything in free, plus:
- Full agentic browser control (navigate, click, type, extract, screenshot)
- Workspace identity — your browser IS your GetRida workspace
- Skills platform (domain-matched JS libraries, 9 built-in, create your own)
- Orchestrator (multi-tab agent dispatch with DAG task graphs)
- Network interception, trusted native events, element inspector
- Recording → skill conversion
- BYOK + OAuth + Rida metered API
- Integrations: GitHub, Obsidian, Notion, Google Suite, LinkedIn, and more

## Install (private beta)

1. Download or clone this repo
2. Open `chrome://extensions/`
3. Enable Developer mode (top right)
4. Click "Load unpacked"
5. Select this directory
6. Pin the extension to your toolbar

## Build

No build step needed for the free tier. The extension runs from source.

For the paid tier (coming soon), a build step will bundle TypeScript + dependencies.

## Architecture

```
popup.html / popup.js     — Free tier popup (compiler UI + meeting-bot status)
sidepanel.html / .js      — Paid tier side panel (agent, skills, settings)
background.js             — Service worker (compile, noise close, session storage, meeting-bot dispatch)
content.js                — Detects meetings on every page (Meet/Zoom/Teams), reports to SW
manifest.json             — Chrome MV3 manifest
manifest.firefox.json     — Firefox MV3 manifest (free tier only)
src/tools/meeting-bot.js  — Vexa dispatch + state machine + webhook setup
tests/                    — Eval suite (run: node tests/run-all.mjs)
```

## Meeting bot (free tier, v0.5.0)

When you visit a meeting page (Google Meet, Zoom web, or Microsoft Teams), the extension detects it and dispatches a [Vexa](https://vexa.artofficial.computer) bot to join your meeting. The bot records audio + video, transcribes in real-time, and posts the transcript to your GetRida workspace.

**Setup:**
1. Get a Vexa API key (https://vexa.artofficial.computer)
2. Open the extension popup → click ⚙ Config → paste your Vexa key (and Worker key if you have one)
3. Visit any meeting URL — bot auto-dispatches within ~3s

**Flow when a meeting is detected:**
1. Extension detects the URL → background.js handler fires
2. Extension calls `POST hooks.getrida.work/api/meetings/register` → gets `session_id`
3. Extension calls `POST vexa.artofficial.computer/bots` → Vexa bot joins (transcript webhook auto-points at Worker)
4. Meeting ends → Vexa POSTs transcript to `hooks.getrida.work/api/meetings/transcript?session_id=...`
5. Worker stores transcript, fires Hermes for post-meeting fulfillment

**Privacy:** The bot joins as YOU with a "GetRida Agent" name. Other participants see it as a recorded meeting participant. You can leave the meeting normally — the bot stays until the meeting ends.

**Costs:** Vexa charges per bot-minute. Set a monthly cap in your Vexa dashboard to avoid surprises.

**Testing:**
```bash
# Unit + e2e (offline-safe):
node tests/run-all.mjs

# Live integration (needs VEXA_API_KEY in ~/gavel/scripts/vexa-bot-dispatcher.sh):
./tests/meeting-bot-live-e2e.sh
```

## License

Free tier: AGPL-3.0 (see LICENSE)
Paid tier: Proprietary (GetRida.Work)

## Links

- [GetRida.Work](https://getrida.work)
- [GetRida Portal](https://portal.getrida.work)
- [Extension Info](https://getrida.work/extension)