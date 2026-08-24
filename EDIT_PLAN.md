# Plan d'action : Espace admin pour éditer les cabinets

## Objectif principal

Donner la possibilité d'ajouter, modifier ou supprimer un cabinet et ses
métadonnées (adresse, téléphone, emails, départements rattachés, tribunaux,
cours d'appel) **sans toucher au code ni au JSON à la main**.

Le visiteur public du site ne voit que la carte (lecture seule, comportement
actuel préservé). L'édition se fait depuis un espace admin séparé, protégé
par un code d'accès vérifié côté serveur (Vercel Function).

## Contrainte forte

Aucun backend à maintenir soi-même. Le `cabinets.geojson` reste la source de
vérité, toujours versionné dans Git. Les modifications passent par des
Pull Requests auto-générées, validées par un admin avant merge.

## Choix d'architecture retenu (révision 2026-08-24)

**Vercel Functions comme backend minimal + hosting unifié**

### Pourquoi Vercel

- Tu es déjà sur GitHub Pages → migration Vercel en 3 clics (import du repo)
- Hosting + Functions dans le même service → pas de vendor supplémentaire
- Custom domain gratuit (tu peux garder ton domaine actuel)
- SSL automatique via Let's Encrypt
- Free tier largement suffisant (100 GB bande passante/mois, 1M invocations)
- Le code d'accès vit dans une **variable d'environnement** Vercel → jamais dans le HTML

### Architecture cible

```
[Visiteur public]                          [Admin (toi)]
       │                                          │
       ▼                                          ▼
  index.html (statique)                    admin.html (statique)
       │                                          │
       ▼                                          ▼
   GitHub raw + Vercel CDN              POST /api/admin-auth
   (lecture seule geojson)                     │
                                          { code: "..." }
                                               │
                                               ▼
                                       Vercel Function
                                       compare avec process.env.ADMIN_CODE
                                               │
                                  ┌────────────┴────────────┐
                                  │ match → 200 + session   │
                                  │ miss → 401               │
                                  └─────────────────────────┘
                                               │
                                               ▼
                                    GET/PUT cabinets.geojson via
                                    GitHub API Contents
                                    (token = Vercel env var)
                                               │
                                               ▼
                                    Auto-création PR vers main
```

### Flux utilisateur final

```
1. Admin ouvre https://cabinetsmap.fr/admin.html
2. Tape le code d'accès → POST /api/admin-auth
3. Si OK : cookie de session signé (HttpOnly, SameSite=Lax, Secure)
4. Liste des cabinets chargée via GET /api/cabinets
5. Click "Modifier" → sheet latérale avec formulaire
6. Validation → POST /api/cabinets (avec action: edit/add/delete)
7. La Function crée branche + commit + PR
8. Toast : "PR créée — ouvrir dans GitHub"
9. Admin merge depuis GitHub
10. Vercel redéploie automatiquement → carte publique mise à jour
```

## Sécurité (réelle cette fois)

| Élément | Sécurité |
|---|---|
| Code d'accès | Hash SHA-256 stocké en variable d'env Vercel. **Jamais dans le HTML**. Le serveur compare. |
| Session admin | Cookie HttpOnly + SameSite=Lax + Secure. Signé avec un secret Vercel env. |
| Token GitHub | Vercel env var uniquement. Jamais transmis au navigateur. |
| CSP | Déjà en place (phase XSS) → interdit les requêtes vers des domaines non whitelistés |
| SRI | Déjà en place → refuse le chargement d'un MapLibre modifié |
| HTTPS | Forcé par Vercel |
| Brute-force | Rate limit Vercel par défaut (limite les tentatives par IP) |

## Structure de fichiers cible

```
.
├── index.html              # Carte publique (statique)
├── admin.html              # NOUVEAU : espace admin (statique)
├── api/                    # NOUVEAU : Vercel Functions
│   ├── admin-auth.js       # POST /api/admin-auth : vérif code + cookie session
│   ├── cabinets.js         # GET/POST /api/cabinets : CRUD + PR auto
│   └── _lib/
│       ├── github.js       # Wrappers API GitHub Contents + PR
│       └── session.js      # Sign/verify cookie session
├── assets/
│   ├── config.js           # Ajout : ADMIN_API_BASE, REPO_OWNER, REPO_NAME
│   ├── ui.js               # Inchangé
│   ├── map.js              # Inchangé
│   ├── styles.css          # Inchangé
│   └── admin/              # NOUVEAU : code spécifique à l'admin
│       ├── auth.js         # UI login (code)
│       ├── cabinets.js     # UI liste + sheet formulaire
│       ├── api.js          # Client API (fetch wrappers)
│       └── styles.css      # Styles admin
├── vercel.json             # NOUVEAU : config Vercel (rewrites si besoin)
├── package.json            # NOUVEAU : deps Vercel Functions (none si vanilla)
└── scripts/                # Inchangé
```

## Variables d'environnement Vercel

| Variable | Valeur | Source |
|---|---|---|
| `ADMIN_CODE_HASH` | SHA-256 du code choisi | À fournir (tu choisis le code) |
| `SESSION_SECRET` | 32+ chars random | `openssl rand -hex 32` |
| `GITHUB_TOKEN` | PAT GitHub (scope fwBoa/CabinetsMAP, contents+PR write) | À créer sur github.com/settings/tokens |
| `REPO_OWNER` | `fwBoa` | constant |
| `REPO_NAME` | `CabinetsMAP` | constant |
| `REPO_BRANCH` | `main` | constant |

## Découpage en phases

### Pré-requis — Merger la branche sécurité
- [ ] Merger `security/xss-csp-sri-hardening` vers `main` (CSP + SRI MapLibre)
- [ ] Pull --rebase côté local
- [ ] Vérifier que `main` build toujours correctement

### Phase 0 — Migration Vercel (humain + moi, ~30 min)
- [ ] **Humain** : créer un compte Vercel (gratuit) via GitHub login
- [ ] **Moi** : ajouter `vercel.json` minimal pour le routing API
- [ ] **Humain** : "New Project" sur vercel.com → import `fwBoa/CabinetsMAP`
- [ ] **Humain** : ajouter les variables d'env Vercel (tableau ci-dessus)
- [ ] Premier déploiement automatique
- [ ] Le site public est maintenant servi par Vercel
- [ ] L'ancien GitHub Pages reste actif en parallèle jusqu'à validation

### Phase 1 — Premier endpoint `/api/admin-auth`
- [ ] Créer `api/admin-auth.js` qui :
  - Reçoit `POST { code }`
  - Compare avec `process.env.ADMIN_CODE_HASH` (SHA-256)
  - Si OK : signe un cookie de session avec `SESSION_SECRET`
  - Retourne 200 + cookie HttpOnly/SameSite=Strict/Secure
- [ ] UI admin : formulaire avec champ code, soumission à l'endpoint
- [ ] Test : mauvais code → 401 ; bon code → cookie set

### Phase 2 — Endpoint `/api/cabinets` (lecture + écriture)
- [ ] Créer `api/cabinets.js` :
  - `GET` : retourne `cabinets.geojson` (via API GitHub Contents, server-side)
  - `POST { action, cabinet }` :
    - `action: edit` : modifie la feature → crée branche → commit → PR
    - `action: add` : ajoute une feature → crée branche → commit → PR
    - `action: delete` : supprime la feature → crée branche → commit → PR
  - Vérification du cookie de session sur chaque appel
- [ ] Librairie `api/_lib/github.js` : wrapper API Contents + Pull Requests

### Phase 3 — UI admin (CRUD complet)
- [ ] Page `admin.html` : header + liste des cabinets + bouton déconnexion
- [ ] Sheet latérale droite avec formulaire :
  - `nom` (required, text)
  - `adresse` (textarea)
  - `phone` (tel)
  - `emails` (array, + pour ajouter)
  - `departements` (multi-select chips sur les 103 codes)
  - `tribunaux` (array texte libre)
  - `cours_appel` (array texte libre)
- [ ] Bouton "Enregistrer" → POST à `/api/cabinets` → spinner → toast + lien PR
- [ ] Bouton "+ Ajouter un cabinet" → sheet vide
- [ ] Bouton "Supprimer" sur chaque cabinet (confirmation requise)

### Phase 4 — Polish
- [ ] Prévisualisation diff JSON avant envoi
- [ ] Loading states partout (spinners, skeleton)
- [ ] Gestion d'erreurs (token GitHub expiré, rate-limit, réseau)
- [ ] Mode sombre (déjà supporté globalement)
- [ ] Mobile : sheet devient bottom-sheet < 768px

### Phase 5 — Cutover final
- [ ] Tester en prod sur Vercel (URL staging)
- [ ] Couper GitHub Pages (le domaine pointe maintenant vers Vercel)
- [ ] Détruire le PAT GitHub initial (sécurité post-cutover)

## Convention de commits

```
chore(vercel): config Vercel minimale (vercel.json + package.json)
feat(api): endpoint /api/admin-auth (vérif code + session cookie)
feat(api): endpoint /api/cabinets (CRUD avec PR auto GitHub)
feat(admin): page admin.html avec login et liste des cabinets
feat(admin): sheet d'édition d'un cabinet
feat(admin): ajout et suppression de cabinet
feat(admin): preview diff avant envoi
```

## Hors périmètre (v1)

- Géolocalisation du cabinet sur la carte (le `cabinet.geojson` actuel n'a
  pas de `geometry` exploitable, on part du principe que les cabinets sont
  rattachés à des départements via `departements[]`)
- Édition des départements (les 103 départements viennent d'un fichier
  shapefile Natural Earth, on n'y touche pas)
- Édition collaborative en temps réel
- Multi-admin avec rôles (un seul code suffit)
- Hosting séparé du frontend (Vercel = tout-en-un)

## Prochaine étape

**Phase 0 (migration Vercel)** — actions humaines de ton côté :

1. Créer un compte Vercel sur https://vercel.com (via GitHub login, 2 min)
2. Créer un PAT GitHub sur https://github.com/settings/tokens
   - Nom : `Vercel CabinetsMAP Editor`
   - Scope : `Only select repositories` → `fwBoa/CabinetsMAP`
   - Droits : `contents: write` + `pull_requests: write`
   - **Bien copier le token affiché une seule fois**
3. Choisir un code d'accès (ex: `CGC-EDIT-2026`) et me le donner en DM
   (jamais en clair dans le code, je le hasherai)
4. Une fois ces 3 éléments en main, je lance la migration Vercel +
   la Phase 1
