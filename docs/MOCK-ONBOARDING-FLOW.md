# Mock Onboarding Flow — GetRida.Work Extension

This is a self-contained mock of the full client onboarding flow.
Open it in a browser that has the GetRida.Work extension installed.

## What it simulates

1. **Stripe Checkout** — Client clicks "Pay $297/mo" on the landing page
2. **Payment success** — Stripe webhook fires, provisioning runs
3. **GRK key provisioned** — Client receives their GRK API key
4. **Extension activation** — Client is directed to install/activate the extension
5. **Agent goes live** — Extension sidebar opens, agent is ready

## How to run

### Option A: Test the full flow in the browser

1. Load the GetRida.Work extension in Chrome (chrome://extensions/ → Developer mode → Load unpacked → select `~/CompanyOS/repos/getrida-extension/`)
2. Open `docs/mock-onboarding.html` in Chrome (file:// URL or serve it)
3. Click "Pay $297/mo" → simulate payment → see the provisioning happen → extension activates

### Option B: Run the provisioning API directly

```bash
# Simulate Stripe webhook → provision a tenant + GRK key
curl -X POST https://app.getrida.work/api/internal/client-ledger/provision \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{
    "tenant_id": "byron-test",
    "email": "byron@test.com",
    "name": "Byron Low",
    "plan_key": "rida_pro",
    "stripe_customer_id": "cus_test_123"
  }'
```

This provisions a new tenant + GRK key in the D1 Register + Postgres on Graymantle-2.

## What's real vs. mocked

| Step | Status |
|------|--------|
| Landing page with pricing | Real (mock-onboarding.html) |
| Stripe Checkout | Mocked (simulated click → instant success) |
| Stripe webhook → provisioning | Real endpoint exists on Worker, simulated here |
| GRK key generation | Real (provisions on Graymantle-2) |
| Extension `setAgentConfig` | Real (via Chrome messaging API) |
| Agent chat via GRK key | Real (DeepSeek on Graymantle-2) |
| Whop onboarding iframe | Real (app.getrida.work/whop) |
| Domain provisioning | Real (D1 workspace_profiles) |
