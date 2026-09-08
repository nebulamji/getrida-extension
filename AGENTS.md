# Agent Notes

## Architecture

Two-tier Chrome Extension (MV3). One codebase, one extension, two modes.

- **Free tier (Compiler):** Popup UI. No auth. Public Worker endpoint for LLM compilation.
- **Paid tier (Agent):** Side panel UI. Supabase JWT gate. BYOK + OAuth + Rida metered API.

The mode switch is `chrome.storage.local[MODE_KEY]`. Free = `free`, Paid = `paid`.

## Build

No build step for free tier. Runs from source.

Paid tier will use esbuild (TypeScript bundling) when TypeScript source is added.

## Files

- `manifest.json` — Chrome MV3 manifest
- `manifest.firefox.json` — Firefox MV3 manifest (free tier only — no debugger/userScripts)
- `background.js` — Service worker: tab capture, compile API call, noise close, session storage
- `popup.html` / `popup.js` — Free tier popup UI
- `sidepanel.html` / `sidepanel.js` — Paid tier side panel (compile + agent + skills + settings tabs)
- `LICENSE` — AGPL-3.0 (free tier)

## Conventions

- No comments in code unless asked
- No emojis
- No `git add -A` — stage specific files
- Never commit unless asked

## Worker Endpoint

Free tier posts to `https://getrida.work/api/v1/compile`:
- No auth header (public, rate-limited)
- Request: `{ mission: string, tabs: [{ url, title, description, h1, body, pageType }] }`
- Response: `{ ok: true, session_id, monofile_preview, view_url, tabs }`

## Paid Tier (Coming)

Gated behind Rida workspace (Supabase JWT). Will include:
- Agent loop (ported from Parchi)
- Skills system (ported from sitegeist)
- Orchestrator (ported from Parchi)
- Element picker, network tools, recording (ported from Parchi + sitegeist)
- OAuth flows (Anthropic, Codex, Copilot, Gemini)
- Rida metered API integration

## F5 Spec

Full spec at: `~/Documents/Obsidian/ops/specs/GETRIDA-EXTENSION-F5-SPEC-2026-07-10.md` (rehydrated 2026-07-26 from CompanyOS/obsidian git history, commit 45845fa59f)