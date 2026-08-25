# Scripts

## `test-admin-e2e.mjs` — Tests E2E admin

Tests automatisés pour l'espace admin CabinetsMAP. Ciblent les Vercel Functions
en production (ou en local via `vercel dev`).

### Usage

```bash
# Production (par défaut, avec mutations DB)
node scripts/test-admin-e2e.mjs

# Lecture seule (sans mutations DB, sûr pour la CI)
SKIP_MUTATIONS=1 node scripts/test-admin-e2e.mjs

# Tests contre un vercel dev local
BASE_URL=http://localhost:3000 node scripts/test-admin-e2e.mjs
```

Les scripts npm `test`, `test:read-only`, `test:local` exécutent ces mêmes
commandes (définis dans `package.json`).

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `BASE_URL` | `https://cabinetsmap.vercel.app` | URL de base de l'API |
| `ADMIN_PASSWORD` | `CGC-EDIT-2026` | Mot de passe admin (seed Neon) |
| `SKIP_MUTATIONS` | `0` | `1` pour ne pas exécuter les tests destructifs |

### Ce qui est testé

1. **Sanity check HTML** : `admin.html` → 200, 4 assets admin, mention "mot de passe"
2. **GeoJSON public** : `/api/geojson/cabinets` → FeatureCollection, Cache-Control 60s
3. **Authentification** : GET status, POST password (invalide/vide/valide), PUT 405, DELETE logout, cookie de clear
4. **Liste cabinets** : GET avec/sans cookie, count >= 1
5. **Mutation edit** : change la couleur d'un cabinet, vérifie la réponse
6. **Restore après edit** : remet la couleur d'origine
7. **Mutation add + delete** : cycle complet (création puis suppression immédiate, sans trace)
8. **DELETE inexistant** : vérifie que le status n'est pas un 500

Total : 37 assertions, ~4 secondes d'exécution.

### Architecture Neon

Les tests mutent directement la base Neon. Pas de PR, pas de GitHub, pas
de `gh` CLI requis. Toute modification est immédiatement effective (le
cache CDN du GeoJSON public expire au bout de 60s).

### Limites connues

- Le cookie de session est HMAC-SHA256 sans blacklist : un cookie reste valide
  jusqu'à expiration (8h) même après logout. C'est attendu (compromis
  stateless simple, sans base Redis).
- Cache CDN de 60s sur `/api/geojson/cabinets` : les modifications ne sont
  visibles publiquement qu'après expiration. Pour bypasser en dev, ajouter
  `?_<timestamp>` à l'URL.

### Hook pre-push (optionnel)

Pas de hook installé pour le moment. Si tu veux un filet de sécurité avant
chaque push, ajoute dans `.git/hooks/pre-push` :

```bash
#!/bin/sh
SKIP_MUTATIONS=1 node scripts/test-admin-e2e.mjs
```

### CI

Pas de GitHub Actions configuré (supprimé lors de la migration Neon).
Pour ajouter CI plus tard, le test `SKIP_MUTATIONS=1` est conçu pour
tourner sans risque sur chaque PR/push.
