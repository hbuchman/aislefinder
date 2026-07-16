#!/usr/bin/env bash
# One-time AWS setup for AisleFinder accounts + list sync/sharing.
# Creates a Cognito user pool (email sign-up with verification) and a
# DynamoDB table, then prints the env vars to plug into .env and Vercel.
#
# Prereqs: aws CLI installed and configured (aws configure), permissions for
# cognito-idp and dynamodb.
#
# Usage: ./infra/setup-aws.sh [region]
set -euo pipefail

REGION="${1:-us-east-1}"
POOL_NAME="aislefinder-users"
TABLE_NAME="aislefinder-lists"

echo "==> Region: $REGION"

# ---------- Cognito user pool ----------
EXISTING_POOL=$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" \
  --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)

if [[ "$EXISTING_POOL" != "None" && -n "$EXISTING_POOL" ]]; then
  POOL_ID="$EXISTING_POOL"
  echo "==> User pool '$POOL_NAME' already exists: $POOL_ID"
else
  echo "==> Creating Cognito user pool '$POOL_NAME'..."
  POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "$POOL_NAME" \
    --region "$REGION" \
    --auto-verified-attributes email \
    --username-attributes email \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":false,"RequireLowercase":false,"RequireNumbers":false,"RequireSymbols":false}}' \
    --verification-message-template '{"DefaultEmailOption":"CONFIRM_WITH_CODE","EmailSubject":"Your AisleFinder verification code","EmailMessage":"Your AisleFinder verification code is {####}"}' \
    --query 'UserPool.Id' --output text)
  echo "    Created: $POOL_ID"
fi

EXISTING_CLIENT=$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --region "$REGION" \
  --query "UserPoolClients[?ClientName=='aislefinder-web'].ClientId | [0]" --output text)

if [[ "$EXISTING_CLIENT" != "None" && -n "$EXISTING_CLIENT" ]]; then
  CLIENT_ID="$EXISTING_CLIENT"
  echo "==> App client 'aislefinder-web' already exists: $CLIENT_ID"
else
  echo "==> Creating app client 'aislefinder-web' (no secret, SRP auth)..."
  CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name "aislefinder-web" \
    --region "$REGION" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --query 'UserPoolClient.ClientId' --output text)
  echo "    Created: $CLIENT_ID"
fi

# ---------- DynamoDB table ----------
if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> DynamoDB table '$TABLE_NAME' already exists"
else
  echo "==> Creating DynamoDB table '$TABLE_NAME' (on-demand billing)..."
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
      AttributeName=share_code,AttributeType=S \
    --key-schema \
      AttributeName=pk,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE \
    --global-secondary-indexes '[{
      "IndexName": "byShareCode",
      "KeySchema": [{"AttributeName": "share_code", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"}
    }]' >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
  echo "    Created."
fi

cat <<EOF

============================================================
Setup complete. Add these to your environments:

Frontend (.env for local dev, and each 'npm run *:build' env):
  REACT_APP_COGNITO_USER_POOL_ID=$POOL_ID
  REACT_APP_COGNITO_CLIENT_ID=$CLIENT_ID

Backend (.env locally; Vercel project env vars for production):
  AISLEFINDER_TABLE=$TABLE_NAME
  COGNITO_REGION=$REGION

Vercel only (AWS_* names are reserved there — create an IAM user
with dynamodb + cognito-idp:GetUser access and set):
  AF_AWS_ACCESS_KEY_ID=<key>
  AF_AWS_SECRET_ACCESS_KEY=<secret>
============================================================
EOF
