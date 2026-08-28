# Documentation technique — CabinetsMAP

> Document interne. Dernière mise à jour : 2026-08-28.

## 1. Vue d'ensemble

CabinetsMAP est une **carte interactive des cabinets d'avocats partenaires du réseau CEGC**, couvrant la France métropolitaine et l'outre-mer. Le site est une application statique + serverless, sans framework frontend.

**URLs :**
- Production : https://cabinetsmap.vercel.app
- Admin : https://cabinetsmap.vercel.app/admin (rewrite → `admin.html`)
- Redirection legacy : https://fwboa.github.io/CabinetsMAP → production (branche `gh-pages`)

## 2. Stack

| Couche | Techno | Détail |
|---|---|---|
| Frontend | Vanilla JS (ES modules) | Aucun framework. MapLibre GL `3.6.2` (CDN unpkg) |
| Styles | CSS pur | Design system maison (variables `--admin-*`, typo Lato + EB Garamond) |
| API | Vercel Functions (Node ESM) | Dossier `api/`, déployées automatiquement |
| Base de données | Neon Postgres | Accès via `@neondatabase/serverless` |
| Hébergement | Vercel | `outputDirectory: "."` — pas de build JS, seul `bust-cache.mjs` tourne |
| Déploiement | CLI local | `vercel --prod --scope team_WYdrwdCCtX61HeRSsuPiaDgy` (**pas** d'auto-deploy GitHub) |
| Tests | Script maison | `node scripts/test-admin-e2e.mjs` — 54 assertions, zéro dépendance |

## 3. Architecture des dossiers

```
├── admin.html              # Espace admin (SPA minimale)
├── index.html              # Page carte publique (générée)
├── index.template.html     # Template source de index.html
├── api/
│   ├── _lib/               # db.js (client Neon), session.js, _util.js
│   ├── admin-auth.js       # POST/GET/DELETE login, status, logout
│   ├── admin-audit.js      # GET journal d'audit brut (debug)
│   ├── admin-history.js    # GET historique 30j (add/edit/delete uniquement)
│   ├── cabinets.js         # GET liste + POST mutations (add/edit/delete)
│   └── geojson/            # endpoints geojson
├── assets/
│   ├── config.js           # Style MapLibre, constantes, état global App
│   ├── map.js              # Init carte + couches cabinets
│   ├── main.js             # Bootstrap page publique
│   ├── ui.js               # Sidebar, recherche, interactions
│   ├── styles.css          # Styles page publique
│   └── admin/
│       ├── api.js          # Client API (fetch, credentials include)
│       ├── auth.js         # Login/logout, gestion de session côté client
│       ├── cabinets.js     # Liste + sheet d'édition + récap (preview diff)
│       ├── departements-*.js # Sélecteur de départements
│       ├── history.js      # Sheet historique (30 jours)
│       └── styles.css      # Styles admin
├── neon/
│   ├── schema.sql          # Schéma complet (cabinets, admin_logs, etc.)
│   └── run-schema.mjs      # Applique le schéma
├── scripts/
│   ├── build_index.py      # Génère index.html depuis le template + smoke-test Neon
│   ├── bust-cache.mjs      # Injecte ?v=<hash> dans admin.html (JS + CSS)
│   ├── geocode_cabinets.py # LEGACY — géocodage Nominatim one-time
│   ├── build_geojson.py    # Construction cabinets.geojson
│   └── test-admin-e2e.mjs  # Suite E2E
└── ne_10m_admin_0_countries/  # Natural Earth (domaine public) pour l'outre-mer
```

## 4. Base de données (Neon)

**Source de vérité : la table `cabinets`.** Le fichier `cabinets.geojson` est un miroir exporté.

### Tables principales

- `cabinets` — id (`cabinet-NN`), nom, adresse, phone, emails[], tribunaux[], cours_appel[], departements[], couleur, badges[], longitude, latitude, created_at, updated_at (trigger)
- `admin_logs` — journal d'audit : `at`, `action` (add/edit/delete/login), `cabinet_id`, `ip`, `user_agent`, `details` (JSONB)
- `admin_settings` — clé/valeur, notamment `password_hash` (bcrypt)

### Format `details` dans admin_logs (depuis 2026-08-27)

```json
{
  "nom": "SELARL DUPONT",
  "diff": {
    "adresse": { "before": "15 rue X", "after": "22 avenue Y" },
    "tribunaux": { "before": ["PARIS"], "after": ["PARIS", "VERSAILLES"] }
  }
}
```

## 5. API

| Endpoint | Méthodes | Auth | Rôle |
|---|---|---|---|
| `/api/cabinets` | GET | non | Liste publique des cabinets (GeoJSON) |
| `/api/cabinets` | POST | oui | Mutation `{ action: add\|edit\|delete, payload }` |
| `/api/admin-auth` | POST | non | Login (bcrypt compare → cookie session) |
| `/api/admin-auth` | GET | oui | Statut de session |
| `/api/admin-auth` | DELETE | oui | Logout |
| `/api/admin-history` | GET | oui | Historique 30j, actions cabinets uniquement |
| `/api/admin-audit` | GET | oui | Journal brut (debug) |

**Session :** cookie `admin_session` HttpOnly, SameSite=Lax, signé HS256 (`SESSION_SECRET`), TTL 8h (`ADMIN_SESSION_TTL_SECONDS`).

## 6. Cache-busting

`scripts/bust-cache.mjs` (lancé par Vercel `buildCommand`) :
- Hache SHA256 (8 chars) de chaque asset admin : `api.js`, `auth.js`, `cabinets.js`, `departements-liste.js`, `departements-picker.js`, `history.js`, `styles.css`
- Injecte `?v=<hash>` dans `admin.html`
- ⚠️ Préserve impérativement `rel="stylesheet"` sur les `<link>` (bug corrigé le 26/08/2026 : le regex écrasait l'attribut et le CSS n'était plus chargé)

Headers cache (`vercel.json`) :
- `/assets/admin/*` → `no-cache, must-revalidate`
- `/api/*` → `no-store`
- `/admin*` → `no-store, private`

## 7. Flux de données

```
[Admin UI] --POST /api/cabinets--> [Vercel Function] --SQL--> [Neon]
                                                      |
[Page publique] --GET /api/cabinets-------------------+
```

- L'admin modifie → Neon écrit → l'audit log enregistre le diff
- La page publique lit → cache HTTP court → affiche les points MapLibre
- `cabinets.geojson` local = miroir (script `sync-cabinets-geojson.mjs`), non critique

## 8. Sources de données

| Donnée | Source | Licence |
|---|---|---|
| Coordonnées cabinets | Géocodage initial via Nominatim (OSM), puis corrections manuelles admin | Données professionnelles publiques |
| Fond de carte | Style MapLibre custom (fond uni, pas de tuiles tierces) | — |
| Outre-mer (polygones) | Natural Earth 10m | Domaine public |
| Départements | `departements.geojson` (généré) | Référentiel public |

## 9. Développement local

```bash
# Lancer les tests E2E (54 assertions)
node scripts/test-admin-e2e.mjs

# Re-générer index.html après édition du template
python3 scripts/build_index.py

# Re-hasher les assets admin
node scripts/bust-cache.mjs

# Déployer
vercel --prod --yes --scope team_WYdrwdCCtX61HeRSsuPiaDgy
```

Variables d'environnement requies (Vercel) : `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SESSION_TTL_SECONDS`. Voir `.env.example`.

## 10. Décisions d'architecture notables

1. **Pas de framework** : le besoin est une carte + une liste. Le JS vanilla garde le bundle minimal et l'auditabilité maximale.
2. **Neon serverless** : HTTP driver, pas de pool TCP — compatible serverless froid.
3. **Déploiement CLI, pas Git-integration** : le push GitHub ne déclenche rien ; c'est `vercel --prod` depuis la machine du développeur qui publie. Le repo est un archive/versioning, pas un canal de déploiement.
4. **Repo GitHub public assumé** : aucun secret dedans (vérifié). Le code est visible, les données et la session sont protégées par bcrypt + cookie signé.
5. **Historique enrichi** : le diff avant/après est calculé côté API au moment de la mutation (snapshot), pas au moment de l'affichage — les données supprimées restent consultables dans l'historique.