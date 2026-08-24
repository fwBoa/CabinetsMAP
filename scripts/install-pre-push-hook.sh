#!/usr/bin/env bash
# scripts/install-pre-push-hook.sh
# Installe un hook Git pre-push qui lance npm run test:read-only
# avant chaque push. En cas d'echec, le push est annule.
#
# Usage : bash scripts/install-pre-push-hook.sh

set -e
cd "$(git rev-parse --show-toplevel)"

HOOK=".git/hooks/pre-push"
BACKUP="$HOOK.bak-$(date +%s)"

if [ -f "$HOOK" ]; then
  echo "⚠ Backup de l'ancien hook : $BACKUP"
  cp "$HOOK" "$BACKUP"
fi

cat > "$HOOK" << 'EOF'
#!/usr/bin/env bash
# Auto-genere par scripts/install-pre-push-hook.sh
# Lance les tests E2E admin en lecture seule avant chaque push.

echo ""
echo "🧪 Pre-push hook : lancement des tests E2E admin..."
echo ""

if ! npm run test:read-only --silent 2>&1; then
  echo ""
  echo "❌ Tests E2E échoués. Push annulé."
  echo "   Pour ignorer : git push --no-verify"
  exit 1
fi

echo ""
echo "✅ Tests E2E passés. Push en cours..."
exit 0
EOF

chmod +x "$HOOK"

echo ""
echo "✅ Hook pre-push installé dans $HOOK"
echo ""
echo "Pour le desactiver temporairement : git push --no-verify"
echo "Pour le supprimer : rm $HOOK"
EOF
