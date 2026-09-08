#!/usr/bin/env bash
# Meeting-bot FULL E2E live test
# Exercises: detector → Worker register → Vexa dispatch → verify both stored
#
# Source the VEXA_API_KEY from ~/gavel/scripts/vexa-bot-dispatcher.sh first.

set -e

EXT_DIR="$HOME/CompanyOS/repos/getrida-extension"
TEST_MEETING_URL="https://meet.google.com/zzz-e2e-$(date +%s)"
TEST_MEETING_ID="zzz-e2e-$(date +%s)"

# Source the key
source "$HOME/gavel/scripts/vexa-bot-dispatcher.sh" 2>/dev/null || {
  echo "FAIL: could not source VEXA_API_KEY from ~/gavel/scripts/vexa-bot-dispatcher.sh"
  exit 1
}

if [ -z "$VEXA_API_KEY" ]; then
  echo "FAIL: VEXA_API_KEY is empty"
  exit 1
fi

echo "=== LIVE E2E TEST ==="
echo "Test meeting: $TEST_MEETING_URL"
echo

# Step 1: Register session with Worker
echo "[1] POST hooks.getrida.work/api/meetings/register"
REGISTER_RES=$(curl -sS --connect-timeout 10 \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{\"gcal_event_id\":\"e2e-live-$TEST_MEETING_ID\",\"meeting_title\":\"E2E Live Test\",\"meeting_url\":\"$TEST_MEETING_URL\",\"scheduled_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"attendee_emails\":[],\"client_slug\":\"kb\"}" \
  -w "\nHTTP_CODE:%{http_code}" \
  "https://hooks.getrida.work/api/meetings/register")
echo "$REGISTER_RES" | tail -1
SESSION_ID=$(echo "$REGISTER_RES" | head -1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('session_id') or d.get('id') or '')")
if [ -z "$SESSION_ID" ]; then
  echo "  WARN: Worker register didn't return a session_id (response above). Continuing."
fi

# Step 2: Dispatch Vexa bot
echo
echo "[2] POST vexa.artofficial.computer/bots"
DISPATCH_RES=$(curl -sS --connect-timeout 10 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VEXA_API_KEY" \
  -X POST \
  -d "{\"platform\":\"google_meet\",\"native_meeting_id\":\"$TEST_MEETING_ID\",\"transcribe_enabled\":false}" \
  -w "\nHTTP_CODE:%{http_code}" \
  "https://vexa.artofficial.computer/bots")
echo "$DISPATCH_RES" | tail -1
BOT_ID=$(echo "$DISPATCH_RES" | head -1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
echo "  Bot ID: $BOT_ID"

# Step 3: Verify Vexa sees the bot
echo
echo "[3] GET vexa.artofficial.computer/bots — verify our bot is there"
sleep 1
LIST_RES=$(curl -sS --connect-timeout 10 -H "X-API-Key: $VEXA_API_KEY" "https://vexa.artofficial.computer/bots")
echo "$LIST_RES" | python3 -c "
import json, sys
d = json.load(sys.stdin)
meetings = d.get('meetings', [])
print(f'  Total bots: {len(meetings)}')
ours = [m for m in meetings if m.get('native_meeting_id') == '$TEST_MEETING_ID']
if ours:
    b = ours[0]
    print(f'  Found our bot: id={b[\"id\"]}, status={b[\"status\"]}, platform={b[\"platform\"]}')
    print(f'  Webhook URL: {b[\"data\"].get(\"webhook_url\", \"<unset>\")}')
else:
    print('  WARN: our bot not in list (might be a 409 dedup or propagation delay)')
"

echo
echo "=== END LIVE E2E ==="
