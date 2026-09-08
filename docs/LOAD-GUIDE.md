# GetRida.Work Chrome Extension — Load Guide

## Install (Dev Mode on cleanstart iMac)

1. Open Chrome on the iMac
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle, top right)
4. Click **Load unpacked**
5. Select: `/Users/cleanstart/getrida-extension`
6. Pin the extension to your toolbar

## What You Get

### Free Tier (no setup)
- Click the extension icon → popup with COMPILE button
- Write a mission, click COMPILE → full report with KEEP vs CLOSE
- Close noise tabs with one click
- Session history builds automatically

### Paid Tier (side panel)
- Right-click extension icon → "Open side panel" (or click side panel icon)
- **6 tabs:** Compile · Agent · Skills · Wallet · World · Settings

### Agent Tab
- Requires API key in Settings (OpenAI or Anthropic BYOK)
- 14 browser tools: navigate, click, type, screenshot, evaluate, etc.
- Pick Element button: interactive element selector (CSS + XPath output)
- Watch Network button: live fetch/XHR traffic monitor

### Wallet Tab
- Click "Connect Wallet" → enter any EVM or Solana address
- Sign the challenge message → paste signature → session created
- Shows authority level, spend cap, confidence score

### World Tab
- Shows workspace state, items, active quests
- Data from `getrida.work/api/v1/world`

### Settings
- Mode: Free (compiler) or Paid (agent + API key)
- Provider: OpenAI / Anthropic
- Custom compile endpoint

## Deploying Updates

To push updated files to cleanstart:
```bash
scp -r ~/CompanyOS/repos/getrida-extension/* cleanstart:~/getrida-extension/
```

Then reload the extension at `chrome://extensions/` → click the refresh icon on the GetRida.Work card.

## Endpoints (all live on getrida.work)

| Endpoint | Purpose |
|----------|---------|
| POST /api/v1/compile | Tab compiler (public, no auth) |
| POST /api/auth/challenge | Wallet auth challenge (SIWE/Solana) |
| POST /api/auth/verify | Wallet signature verification |
| GET /api/v1/world | Workspace world state |
| GET /api/v1/x402/status | x402 settlement status |
| POST /api/v1/a2a/send | A2A email dispatch |
| GET /api/v1/a2a/inbox | Agent inbox reader |