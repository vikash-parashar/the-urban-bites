#!/usr/bin/env bash
# Builds the Go API and deploys it to AWS Lambda behind an API Gateway HTTP API.
# Safe to run again: it updates the code and settings if they already exist.
#
# Needs: aws CLI signed in (aws configure), Go 1.25+, zip.
# Env:
#   DATABASE_URL     Neon connection string (with sslmode=require)
#   JWT_SECRET       long random string, e.g. `openssl rand -base64 48` (keep it; changing it signs everyone out)
#   ALLOWED_ORIGINS  default https://theurbanbites.in,https://www.theurbanbites.in
#   AWS_REGION       default ap-south-1 (Mumbai)
#   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  order alerts with the staff screen closed (Web Push). Make a pair
#                    once with `cd api && go run ./cmd/seed -vapid` and keep it: a new pair means every
#                    phone has to turn alerts on again. Without them, alerts only ring while the screen is open.
#   VAPID_SUBJECT    contact for the push services, default https://theurbanbites.in
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${JWT_SECRET:?set JWT_SECRET}"
REGION="${AWS_REGION:-ap-south-1}"
ORIGINS="${ALLOWED_ORIGINS:-https://theurbanbites.in,https://www.theurbanbites.in}"
FN=urban-bites-api
ROLE=urban-bites-api-role
API=urban-bites-http
export AWS_REGION="$REGION" AWS_PAGER=""

here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "› Building (linux/arm64)"
(cd "$here/api" && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags='-s -w' -o "$work/bootstrap" ./cmd/api)
(cd "$work" && zip -q api.zip bootstrap)

account="$(aws sts get-caller-identity --query Account --output text)"

echo "› IAM role"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "  waiting for the role to be usable…"; sleep 12
fi
role_arn="arn:aws:iam::$account:role/$ROLE"

# Lambda env is written via a file so the secrets don't show up in `ps`.
cat > "$work/env.json" <<JSON
{"Variables":{"DATABASE_URL":"$DATABASE_URL","JWT_SECRET":"$JWT_SECRET","ALLOWED_ORIGINS":"$ORIGINS",
 "VAPID_PUBLIC_KEY":"${VAPID_PUBLIC_KEY:-}","VAPID_PRIVATE_KEY":"${VAPID_PRIVATE_KEY:-}","VAPID_SUBJECT":"${VAPID_SUBJECT:-https://theurbanbites.in}"}}
JSON
[ -n "${VAPID_PRIVATE_KEY:-}" ] || echo "  ! VAPID keys not set: order alerts will only ring while the staff screen is open"

echo "› Lambda function"
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$work/api.zip" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "file://$work/env.json" >/dev/null
else
  aws lambda create-function --function-name "$FN" --runtime provided.al2023 --architectures arm64 \
    --handler bootstrap --role "$role_arn" --zip-file "fileb://$work/api.zip" \
    --memory-size 256 --timeout 15 --environment "file://$work/env.json" >/dev/null
fi
aws lambda wait function-updated --function-name "$FN" 2>/dev/null || aws lambda wait function-active --function-name "$FN"
fn_arn="arn:aws:lambda:$REGION:$account:function:$FN"

echo "› API Gateway"
api_id="$(aws apigatewayv2 get-apis --query "Items[?Name=='$API'].ApiId | [0]" --output text)"
if [ "$api_id" = "None" ] || [ -z "$api_id" ]; then
  api_id="$(aws apigatewayv2 create-api --name "$API" --protocol-type HTTP --target "$fn_arn" --query ApiId --output text)"
  aws lambda add-permission --function-name "$FN" --statement-id apigw-invoke --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:$REGION:$account:$api_id/*" >/dev/null
fi
url="$(aws apigatewayv2 get-api --api-id "$api_id" --query ApiEndpoint --output text)"

echo "› Health check"
curl -fsS "$url/v1/shop" >/dev/null && echo "  OK" || echo "  ✗ $url/v1/shop did not answer; check: aws logs tail /aws/lambda/$FN --since 5m"

echo
echo "API is live at: $url"
echo "Use it as VITE_API_URL (website) and the API_URL repo variable (Android app)."
