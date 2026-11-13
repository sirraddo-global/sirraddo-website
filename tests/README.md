# Tests

`npm install` once, then `npm test`. It builds the site, then runs `tests/*.test.mjs` against
`tests/harness.mjs`: every API handler runs in-process with an in-memory Postgres (PGlite) and fake
Paystack, Cloudflare, Resend (email), Gemini (AI) and Blob storage. Nothing real is called and no keys are needed.

The same suite runs on GitHub for every pull request (`.github/workflows/tests.yml`). Merge only when it's green.
