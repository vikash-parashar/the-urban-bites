#!/usr/bin/env bash
# Deploys the Go API to Google Cloud Run (Singapore, next to the Neon database) from api/Dockerfile. No AWS needed.
# Free tier covers this cart's traffic (2M requests/month); it scales to zero when idle.
#
# Needs: gcloud CLI signed in (gcloud auth login), a project with billing enabled.
# Env:
#   GCP_PROJECT      your Google Cloud project id
#   DATABASE_URL     Neon connection string (with sslmode=require)
#   JWT_SECRET       long random string, e.g. `openssl rand -base64 48` (keep it)
#   ALLOWED_ORIGINS  default https://theurbanbites.in,https://www.theurbanbites.in
#   GCP_REGION       default asia-southeast1 (Singapore, same as Neon)
set -euo pipefail

: "${GCP_PROJECT:?set GCP_PROJECT}"
: "${DATABASE_URL:?set DATABASE_URL}"
: "${JWT_SECRET:?set JWT_SECRET}"
REGION="${GCP_REGION:-asia-southeast1}"
ORIGINS="${ALLOWED_ORIGINS:-https://theurbanbites.in,https://www.theurbanbites.in}"
SVC=urban-bites-api
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

gcloud config set project "$GCP_PROJECT" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null

# Env vars go through a file so the secrets don't show up in `ps`. ALLOWED_ORIGINS has commas,
# which is why this uses a YAML file instead of --set-env-vars.
cat > "$work/env.yaml" <<YAML
DATABASE_URL: '$DATABASE_URL'
JWT_SECRET: '$JWT_SECRET'
ALLOWED_ORIGINS: '$ORIGINS'
YAML

gcloud run deploy "$SVC" --source "$here/api" --region "$REGION" \
  --allow-unauthenticated --env-vars-file "$work/env.yaml" \
  --memory 256Mi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 40 --quiet

url="$(gcloud run services describe "$SVC" --region "$REGION" --format 'value(status.url)')"
curl -fsS "$url/v1/shop" >/dev/null && echo "Health check OK" || echo "✗ $url/v1/shop did not answer; check: gcloud run services logs read $SVC --region $REGION"
echo
echo "API is live at: $url"
echo "Use it as VITE_API_URL (Cloudflare Pages) and the API_URL repo variable (Android app)."
