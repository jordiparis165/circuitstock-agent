# Team Onboarding

CircuitStock needs Binance Web3 API credentials on the server only. Do not commit `.env`, even while the repository is private.

## Local Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Then fill `.env` with the shared credentials using a secure channel.

## Deploys

Frontend production deploys now run from GitHub Actions on every push to `main`.

Matthieu does not need the owner's Vercel password, `.env.local`, or `VERCEL_OIDC_TOKEN`.
He only needs GitHub write access to this repo:

```bash
git checkout main
git pull
git push
```

The workflow uses repository secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Manual deploy is also available from GitHub: Actions -> Deploy frontend to Vercel -> Run workflow.

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
