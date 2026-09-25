# Tam-Coverage-Dashboard — Spyne AWS deployment

**Type:** TYPE A — static site, no server of its own (plain HTML/CSS/JS, no build step, no
`package.json`, no Next.js, no serverless functions). Confirmed by inspection: `dist/` is the
entire deployable artifact.

**Runs on:** Spyne AWS, served at `https://tam-coverage-dashboard.spyne.ai`. The pipeline builds
from the `aws-prod` branch.

**Config:** non-secret runtime config lives in `config.json` at the repo root (currently `{}` —
nothing the front end needs to read at runtime yet). This is a static site with no server
process, so there is no `APP_SECRETS` env var to parse here — that mechanism is for TYPE
B/C/D apps with a running process. If this app ever needs a client-readable value (an API base
URL, a feature flag), add it to `config.json` and have `app.js` fetch it — never put a secret
there, since anything in `dist/` is public.

**Sign-in requirement — NOT implemented in this repo, and can't be:** every internal Spyne app
must be behind Google sign-in on every route. A static site served from S3/CloudFront has no
per-request server code to run auth middleware in, so this can't be added to the app itself.
Enforcing it requires an AWS-side auth layer in front of the static origin — typically either
an ALB configured with an OIDC "authenticate" listener rule, or CloudFront + Lambda@Edge/
CloudFront Functions validating a session before the origin request. That is infrastructure
Shield/DevOps provisions, not something that belongs in this repo's code. **Do not** work
around this with client-side JS that checks a cookie or redirects in the browser — that's
trivially bypassable (view-source or a direct S3 URL skips it entirely) and would be worse than
no auth, since it looks protected but isn't. Confirm with DevOps whether their standard TYPE A
CloudFront template already includes this, and if not, get it added before this goes live.

**Build/deploy files:** `code-build.yaml` and `code-deploy.yaml` at the repo root are adapted
for a static S3 + CloudFront deploy (sync `dist/` to S3, invalidate CloudFront). The reference
files given for this migration were container/ECR-based (correct for TYPE B/C, not this app) —
these were written from scratch to fit a static site, using placeholder env var names
(`$S3_BUCKET_NAME`, `$CLOUDFRONT_DISTRIBUTION_ID`) that need confirming with DevOps/Shield
before the pipeline is wired up.

**Health check:** `dist/health` is a static JSON file (can't have a live timestamp — there's no
server to generate one per request). Whether a static site needs a polled health check at all
depends on how DevOps fronts it (no ECS task to restart on failure the way a container app has).

**Rebuilding the data:** see `README.md` — `scripts/build_data.py` and `scripts/build_cs_data.py`
regenerate `dist/data.js` and `dist/cslive-data.js` from the HubSpot export and the CS Live
Google Sheet respectively.
