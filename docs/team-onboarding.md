# Team Onboarding

CircuitStock needs Binance Web3 API credentials on the server only. Do not commit `.env`, even while the repository is private.

## Local Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Then fill `.env` with the shared credentials using a secure channel.

## Required Secrets

```env
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_API_SECRET=
```

The rest of the defaults in `.env.example` can stay unchanged for local work.

## Safe Sharing

Use one of these instead of git history:

- Password manager shared vault.
- Encrypted message.
- In-person transfer.
- Rotate the Binance Web3 key after the hackathon.

## Verification

After filling `.env`, run:

```bash
npm run build
npm run dev:server
```

Then check:

```text
http://localhost:8787/api/health
```

Expected:

```json
{
  "ok": true,
  "apiConfigured": true,
  "apiKeyStatus": "configured"
}
```
