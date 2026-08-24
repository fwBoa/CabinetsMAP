#!/usr/bin/env bash
# =============================================================================
# scripts/seed-vercel-env.sh
# Pousse les variables d'environnement sur Vercel.
# Requis : vercel CLI authentifie (vercel login) ET dans le repo.
#
# Usage :
#   bash scripts/seed-vercel-env.sh production    # vers l'env "Production"
#   bash scripts/seed-vercel-env.sh preview       # vers l'env "Preview"
# =============================================================================
set -euo pipefail

ENV="${1:-production}"
case "$ENV" in
  production|prod) ENV="production" ;;
  preview)         ENV="preview" ;;
  *) echo "Env inconnu: $ENV (production ou preview)"; exit 1 ;;
esac

# Verification que les secrets sont presents en local
: "${ADMIN_CODE_HASH:?Variable ADMIN_CODE_HASH requise (echo -n TON_CODE | shasum -a 256)}"
: "${SESSION_SECRET:?Variable SESSION_SECRET requise (openssl rand -hex 32)}"
: "${GITHUB_TOKEN:?Variable GITHUB_TOKEN requise (https://github.com/settings/tokens)}"
: "${GITHUB_REPO_OWNER:=fwBoa}"
: "${GITHUB_REPO_NAME:=CabinetsMAP}"
: "${GITHUB_DEFAULT_BRANCH:=main}"
: "${ADMIN_SESSION_TTL_SECONDS:=28800}"

echo "== Pousse des variables vers Vercel ($ENV) =="

vercel env add ADMIN_CODE_HASH "$ENV" <<< "$ADMIN_CODE_HASH"
vercel env add SESSION_SECRET  "$ENV" <<< "$SESSION_SECRET"
vercel env add GITHUB_TOKEN    "$ENV" <<< "$GITHUB_TOKEN"
vercel env add GITHUB_REPO_OWNER       "$ENV" <<< "$GITHUB_REPO_OWNER"
vercel env add GITHUB_REPO_NAME        "$ENV" <<< "$GITHUB_REPO_NAME"
vercel env add GITHUB_DEFAULT_BRANCH   "$ENV" <<< "$GITHUB_DEFAULT_BRANCH"
vercel env add ADMIN_SESSION_TTL_SECONDS "$ENV" <<< "$ADMIN_SESSION_TTL_SECONDS"

echo ""
echo "== Verif =="
vercel env ls "$ENV"

echo ""
echo "Termine. Relancer un deploy si necessaire :"
echo "  vercel --prod"
