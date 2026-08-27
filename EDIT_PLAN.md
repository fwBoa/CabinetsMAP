# Espace admin — CabinetsMAP

## Objectif

Permettre d'ajouter, modifier ou supprimer un cabinet et ses métadonnées
(adresse, téléphone, emails, départements rattachés, tribunaux, cours d'appel,
couleur, coordonnées GPS) depuis un espace admin séparé, sans toucher au
code ni au JSON à la main.

Le visiteur public voit la carte (lecture seule). L'édition se fait depuis
`/admin.html`, protégé par mot de passe vérifié côté serveur (Vercel Function).

## Architecture cible (depuis 2026-08-25)

**Vercel (hosting statique + Functions) + Neon Postgres (base de données)**

```
[Visiteur public]                          [Admin]
       │                                          │
       ▼                                          ▼
  index.html (statique)                    admin.html (statique)
       │                                          │
       ▼                                          ▼
 /api/geojson/cabinets                   /api/admin-auth
       │  (GET public, 60s cache)              │  (POST password → cookie HMAC)
       ▼                                          ▼
       ┌──────────────────────────────────────────┐
       │ Neon Postgres (table `cabinets`)         │
       └──────────────────────────────────────────┘
                              ▲
                              │ POST edit/add/delete
                       /api/cabinets  (auth requise)
```

### Pourquoi Neon + Vercel

- **Vercel** : hosting déjà en place, Functions incluses (pas de serveur à gérer)
- **Neon Postgres** : Postgres serverless gratuit, intégration native Vercel,
  branches de DB possibles pour les previews Vercel
- **Mutations immédiates** : pas de PR GitHub à merger, pas d'attente CI
- **Cookie de session HMAC** signé côté serveur avec `SESSION_SECRET`

## Variables d'environnement Vercel

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Secret HMAC pour signer les cookies de session (≥32 car.) |
| `ADMIN_SESSION_TTL_SECONDS` | Durée de session en secondes (défaut 28800 = 8h) |
| `DATABASE_URL` | URL Postgres Neon (auto-générée par Vercel Storage) |

Les variables Neon supplémentaires (`POSTGRES_URL`, `PGHOST`, etc.) sont
auto-générées par Vercel Storage et n'ont pas besoin d'être gérées à la main.

## Schéma DB

Trois tables dans `neon/schema.sql` :

- **`cabinets`** : id, nom, adresse, phone, emails[], tribunaux[],
  cours_appel[], departements[], couleur, badges[], display_name,
  place_id, longitude, latitude, created_at, updated_at
- **`departements`** : id, nom, geometry (GeoJSON), bbox
- **`admin_settings`** : clé/valeur pour les configs admin (password hash, etc.)

Trigger `set_updated_at` met à jour `updated_at` automatiquement sur chaque
UPDATE.

## API Vercel Functions

| Endpoint | Méthode | Auth | Description |
|---|---|---|---|
| `/api/admin-auth` | GET | — | `{ authenticated: bool }` |
| `/api/admin-auth` | POST | — | `{ password }` → cookie + `{ ok: true }` |
| `/api/admin-auth` | DELETE | oui | Clear cookie |
| `/api/cabinets` | GET | oui | Liste tous les cabinets |
| `/api/cabinets` | POST | oui | `{ action: edit \| add \| delete, payload }` |
| `/api/geojson/cabinets` | GET | public | GeoJSON FeatureCollection (60s cache CDN) |

## Sécurité

- Cookie `cm_admin_session` : `HttpOnly`, `SameSite=Lax`, `Secure` en prod
- Password hashé en bcrypt stocké dans `admin_settings.password_hash`
- Pas de PAT GitHub ni d'accès au repo nécessaires
- Endpoint public GeoJSON sans PII (uniquement données métier)
- `Cache-Control: no-store` sur `/api/admin-auth` et `/api/cabinets`

## Tests

`scripts/test-admin-e2e.mjs` — 37 assertions, exécution ~4s.

```bash
# Production (par défaut)
node scripts/test-admin-e2e.mjs

# Lecture seule (sûre, sans mutations)
SKIP_MUTATIONS=1 node scripts/test-admin-e2e.mjs

# Local (lance d'abord `vercel dev` dans un autre terminal)
BASE_URL=http://localhost:3000 node scripts/test-admin-e2e.mjs
```

## Migration depuis l'ancien workflow GitHub

Avant : mutation admin → création de branche → commit → PR → merge manuel
Maintenant : mutation admin → UPDATE/INSERT/DELETE Neon → visible en
60s (cache CDN) → plus rapide, plus simple, plus de PR à nettoyer.
