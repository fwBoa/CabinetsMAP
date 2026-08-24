#!/usr/bin/env bash
# =============================================================================
# scripts/seed-vercel-env-interactive.sh
# Pousse les variables d'environnement Vercel en securite.
# - Demande chaque secret via TTY (pas dans l'historique shell)
# - Calcule le hash SHA-256 du code d'acces
# - Genere un SESSION_SECRET aleatoire
# - Pousse les 7 variables vers Vercel
# - Verifie le resultat
# - N'affiche JAMAIS les valeurs en clair apres les avoir poussees
#
# Usage : bash scripts/seed-vercel-env-interactive.sh [production|preview]
# =============================================================================
set -euo pipefail

ENV="${1:-production}"
case "$ENV" in
  production|prod) ENV="production" ;;
  preview)         ENV="preview" ;;
  *) echo "Env inconnu: $ENV (production ou preview)"; exit 1 ;;
esac

echo "============================================================"
echo "  Seed variables Vercel - env: $ENV"
echo "============================================================"
echo ""

# --- 1. Demande du code d'acces (saisi sans echo) ---
echo "ETAPE 1/4 : code d'acces admin"
echo "  - Tape le code (saisie masquee, min 8 caracteres)"
echo "  - Il sera hash en SHA-256 et seul le hash sera stocke"
echo ""
read -r -s -p "  Code d'acces: " ADMIN_CODE
echo ""
if [ "${#ADMIN_CODE}" -lt 8 ]; then
  echo "  ERREUR: le code doit faire au moins 8 caracteres" >&2
  exit 1
fi
ADMIN_CODE_HASH=$(printf '%s' "$ADMIN_CODE" | shasum -a 256 | cut -d' ' -f1)
unset ADMIN_CODE
echo "  OK - hash calcule (longueur: ${#ADMIN_CODE_HASH} chars)"
echo ""

# --- 2. Generation automatique du SESSION_SECRET ---
echo "ETAPE 2/4 : SESSION_SECRET (auto-genere)"
SESSION_SECRET=$(openssl rand -hex 32)
echo "  OK - 64 caracteres hexa generes"
echo ""

# --- 3. Demande du token GitHub (saisi sans echo) ---
echo "ETAPE 3/4 : Personal Access Token GitHub"
echo "  - Format attendu: ghp_... ou github_pat_..."
echo "  - Doit avoir les droits contents:write + pull_requests:write"
echo "  - Scope: uniquement fwBoa/CabinetsMAP"
echo ""
read -r -s -p "  Token GitHub: " GITHUB_TOKEN
echo ""
if [ -z "$GITHUB_TOKEN" ]; then
  echo "  ERREUR: token vide" >&2
  exit 1
fi
echo "  OK (longueur: ${#GITHUB_TOKEN} chars)"
echo ""

# --- 4. Variables statiques ---
echo "ETAPE 4/4 : constantes repo"
GITHUB_REPO_OWNER="fwBoa"
GITHUB_REPO_NAME="CabinetsMAP"
GITHUB_DEFAULT_BRANCH="main"
ADMIN_SESSION_TTL_SECONDS="28800"
echo "  - GITHUB_REPO_OWNER       = $GITHUB_REPO_OWNER"
echo "  - GITHUB_REPO_NAME        = $GITHUB_REPO_NAME"
echo "  - GITHUB_DEFAULT_BRANCH   = $GITHUB_DEFAULT_BRANCH"
echo "  - ADMIN_SESSION_TTL_SECONDS = $ADMIN_SESSION_TTL_SECONDS"
echo ""

# --- Push vers Vercel ---
echo "============================================================"
echo "  Push des 7 variables vers Vercel ($ENV)..."
echo "============================================================"
echo ""

vercel env add ADMIN_CODE_HASH          "$ENV" <<< "$ADMIN_CODE_HASH"
vercel env add SESSION_SECRET           "$ENV" <<< "$SESSION_SECRET"
vercel env add GITHUB_TOKEN             "$ENV" <<< "$GITHUB_TOKEN"
vercel env add GITHUB_REPO_OWNER        "$ENV" <<< "$GITHUB_REPO_OWNER"
vercel env add GITHUB_REPO_NAME         "$ENV" <<< "$GITHUB_REPO_NAME"
vercel env add GITHUB_DEFAULT_BRANCH    "$ENV" <<< "$GITHUB_DEFAULT_BRANCH"
vercel env add ADMIN_SESSION_TTL_SECONDS "$ENV" <<< "$ADMIN_SESSION_TTL_SECONDS"

# --- Verif ---
echo ""
echo "============================================================"
echo "  Variables poussees (verif)"
echo "============================================================"
vercel env ls "$ENV"

# --- Cleanup memoire ---
unset ADMIN_CODE_HASH SESSION_SECRET GITHUB_TOKEN
echo ""
echo "Termine. Secrets effaces de la memoire du shell."
echo "Tu peux maintenant deployer : vercel --prod"
