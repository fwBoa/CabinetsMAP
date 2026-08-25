#!/usr/bin/env bash
# =============================================================================
# scripts/seed-vercel-env.sh
# Pousse les variables d'environnement minimales sur Vercel.
# Requis : vercel CLI authentifie (vercel login) ET dans le repo.
#
# Note : DATABASE_URL est auto-générée par Vercel Storage lors du
# "Connect to Project" sur Neon. Ce script pousse uniquement les
# variables qu'on gère à la main.
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
: "${SESSION_SECRET:?Variable SESSION_SECRET requise (openssl rand -hex 32)}"
: "${ADMIN_SESSION_TTL_SECONDS:=28800}"

echo "== Pousse des variables vers Vercel ($ENV) =="

vercel env add SESSION_SECRET           "$ENV" <<< "$SESSION_SECRET"
vercel env add ADMIN_SESSION_TTL_SECONDS "$ENV" <<< "$ADMIN_SESSION_TTL_SECONDS"

echo ""
echo "== Verif =="
vercel env ls "$ENV"

echo ""
echo "N'oublie pas de vérifier que DATABASE_URL est bien présente :"
echo "  elle est ajoutée automatiquement par Vercel Storage Neon."
echo ""
echo "Si tu n'as pas encore créé la base :"
echo "  → vercel.com/dashboard → Storage → Create New → Neon"
echo "  → Connect to Project → l'env \$ENV"
echo ""
echo "Termine. Relancer un deploy si nécessaire :"
echo "  vercel --prod"
