# Scripts

## `test-admin-e2e.mjs` — Tests E2E admin

Tests automatisés pour l'espace admin CabinetsMAP. Ciblent les Vercel Functions
en production (ou en local via `vercel dev`).

### Usage

```bash
# Tests lecture seule (auth + GET cabinets + sanity check HTML)
npm run test:read-only

# Tests complets (avec mutations : edit/add/delete → créent des PRs)
# ⚠ N'exécute qu'en dev ou dans la CI. Toujours nettoyer les PRs après.
npm test

# Tests contre un vercel dev local
npm run test:local
```

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `BASE_URL` | `https://cabinetsmap.vercel.app` | URL de base de l'API |
| `ADMIN_CODE` | `CGC-EDIT-2026` | Code d'accès admin (en clair pour les tests, ne jamais commit en vrai code) |
| `SKIP_MUTATIONS` | `0` | Mettre à `1` pour ne pas exécuter les tests destructifs |

### Ce qui est testé

1. **Sanity check HTML** (`admin.html` → 200, références aux 4 JS/CSS, pas de note footer)
2. **Authentification** (`/api/admin-auth`)
   - GET status sans/avec cookie
   - POST code invalide (401), vide (400), valide (200)
   - PUT non autorisée (405)
   - DELETE logout avec cookie de clear
3. **Liste cabinets** (`/api/cabinets`)
   - GET sans cookie (401), avec cookie (200)
   - Vérification count >= 1, présence du SHA
4. **Mutations** (`/api/cabinets` POST)
   - `edit` : crée une PR avec le cabinet modifié
   - `add` : crée une PR avec un nouveau cabinet
   - `delete` : vérifie que le payload invalide est rejeté (note : renvoie 500 au lieu de 404, bug connu)
5. **Cleanup** automatique des PRs de test via `gh pr close --delete-branch`

### Limites connues

- Le cookie de session est HMAC-SHA256 sans blacklist : un cookie reste valide jusqu'à expiration (8h) même après logout. C'est attendu.
- Le `delete` d'un cabinet inexistant renvoie `500` au lieu de `400/404` (bug dans `api/cabinets.js` catch générique).
- Les tests de mutation créent de vraies PRs sur GitHub. À n'utiliser que sur un repo de test ou via la CI avec cleanup.

### Ajouter au workflow local

```bash
bash scripts/install-pre-push-hook.sh
```

Cela installe un hook `pre-push` qui lance `npm run test:read-only` avant chaque push.

### Ajouter à la CI

Le fichier `.github/workflows/test-admin.yml` lance les tests en lecture seule à chaque PR/push, et les tests avec mutations sur push direct vers `main` (avec `ADMIN_CODE` configuré dans les secrets GitHub).
