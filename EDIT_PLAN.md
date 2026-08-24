# Plan d'action : Espace admin pour éditer les cabinets

## Objectif principal

Donner la possibilité d'ajouter, modifier ou supprimer un cabinet et ses
métadonnées (adresse, téléphone, emails, départements rattachés, tribunaux,
cours d'appel) **sans toucher au code ni au JSON à la main**.

Le visiteur public du site ne voit que la carte (lecture seule, comportement
actuel préservé). L'édition se fait depuis un espace admin séparé, protégé
par GitHub OAuth.

## Contrainte forte

Aucun backend à maintenir. Le `cabinets.geojson` reste la source de vérité,
toujours versionné dans Git. Les modifications passent par des Pull Requests
auto-générées, validées par un admin avant merge.

## Choix d'architecture retenu

**Option A : GitHub OAuth + API Contents**

- `/admin.html` = page statique séparée, déployée au même endroit que `index.html`
- Auth : GitHub OAuth (`https://github.com/login/oauth/authorize`)
- Whitelist : un ou plusieurs `github_username` autorisés (config)
- Une fois loggé, l'admin lit `cabinets.geojson` via l'API GitHub Contents,
  édite via une sheet latérale, et soumet via `PUT /repos/{owner}/{repo}/contents/cabinets.geojson`
  qui crée automatiquement une branche + une PR
- Tu merger depuis GitHub → carte publique mise à jour au prochain redeploy

**Pourquoi :**
- Pas de backend, pas de BDD, pas de coût
- Tu connais déjà GitHub (tu push dessus tous les jours)
- Audit trail gratuit (chaque modif = un commit signé avec ton compte)
- Token GitHub **user-level** jamais commité (stocké en `sessionStorage`, révoqué au logout)
- Plusieurs admins possibles (toi + un associé) sans modifier le code

## Sécurité

- OAuth flow standard (`response_type=code`, `scope=public_repo`)
- Whitelist username côté client (faible mais OK pour un projet solo : un
  attaquant ne peut pas commit même en bypassant le whitelist, car le token
  GitHub est lié à TON compte)
- Le token n'est jamais persisté au-delà de la session navigateur
- CSP déjà en place (phase XSS) interdira les requêtes sortantes non whitelists
- CSRF : state token OAuth + SameSite=Lax cookie

## Structure de fichiers cible

```
.
├── index.html              # Carte publique (inchangée)
├── admin.html              # NOUVEAU : espace admin
├── assets/
│   ├── config.js           # Ajout : ADMIN_USERNAME_WHITELIST, OAUTH_CLIENT_ID
│   ├── ui.js               # Inchangé
│   ├── map.js              # Inchangé
│   ├── styles.css          # Inchangé (ou très peu)
│   └── admin/              # NOUVEAU : code spécifique à l'admin
│       ├── auth.js         # OAuth GitHub + gestion session
│       ├── api.js          # Wrappers API GitHub Contents + PR
│       ├── cabinets.js     # CRUD cabinets (lecture, écriture, suppression)
│       ├── form.js         # Sheet formulaire d'édition
│       ├── ui.js           # Liste admin + interactions
│       └── styles.css      # Styles spécifiques admin
└── scripts/
    └── ...
```

## Découpage en phases

### Phase 0 — Préparation GitHub (humain, ~15 min)
- [ ] Créer une OAuth App sur https://github.com/settings/developers
      - Application name : `CabinetsMAP Admin`
      - Homepage URL : `https://fwboa.github.io/CabinetsMAP/`
      - Authorization callback URL : `https://fwboa.github.io/CabinetsMAP/admin.html`
- [ ] Récupérer le `Client ID` (public, va dans `assets/config.js`)
- [ ] Générer un `Client Secret` (privé, ne va PAS dans le code)
      → Limite : OAuth App "classique" **ne permet pas** un flow pure-frontend
      car le secret doit être échangé contre un token côté serveur.
- [ ] **Pivot** : on utilise un **GitHub Device Flow** OU on crée une
      **GitHub App** (recommandé) qui supporte le flow user-to-server
      via JWT signé. Voir sous-phase 0b.

### Phase 0b — GitHub App (humain, ~30 min, à confirmer)
- [ ] Créer une GitHub App sur https://github.com/settings/apps/new
      - Name : `CabinetsMAP Editor`
      - Homepage : `https://fwboa.github.io/CabinetsMAP/`
      - Webhook : désactivé
      - Permissions : Contents = Read & Write, Pull requests = Read & Write
      - Where can this GitHub App be installed? : Only on this account
- [ ] Installer l'App sur le repo `fwBoa/CabinetsMAP`
- [ ] Générer une **clé privée** (.pem) → à fournir via variable d'env au
      backend minimal OU via une Cloudflare Worker qui sert de proxy
- [ ] **OU** : si on reste pure-frontend, utiliser le flow
      "Login with GitHub" + token personnel via `gh` CLI embarqué
      (complexe, on privilégie l'option Cloudflare Worker gratuite)

### Phase 1 — Espace admin minimal
- [ ] Page `admin.html` qui charge `assets/admin/*`
- [ ] Bouton "Se connecter avec GitHub"
- [ ] OAuth flow (redirect → GitHub → callback avec `code` → échange contre token)
- [ ] Stockage du token en `sessionStorage` uniquement
- [ ] Affichage du profil utilisateur (`GET /user`)
- [ ] Whitelist : si le username ne match pas → déconnexion immédiate
- [ ] Liste read-only des 13 cabinets (load `cabinets.geojson` via `GET raw.githubusercontent.com`)

### Phase 2 — Édition d'un cabinet
- [ ] Click sur un cabinet → ouvre sheet latérale droite (réutiliser la
      pattern visuel de la sheet détail existante)
- [ ] Formulaire avec tous les champs :
      `nom` (required), `adresse`, `phone`, `emails` (array),
      `departements` (multi-select sur les 103 codes),
      `tribunaux` (array texte libre), `cours_appel` (array texte libre)
- [ ] Validation côté client (nom non vide, format email basique)
- [ ] Bouton "Enregistrer" → :
      1. Charge `cabinets.geojson` actuel via API Contents (récupère le `sha`)
      2. Modifie la feature correspondante en mémoire
      3. Crée une nouvelle branche `edit/cabinet-<slug>-<timestamp>`
      4. PUT le nouveau contenu sur cette branche
      5. Ouvre une PR vers `main` avec message pré-rempli
      6. Redirige vers la page PR GitHub dans un nouvel onglet
- [ ] Toast "PR créée — va sur GitHub pour merger"

### Phase 3 — Ajout / Suppression
- [ ] Bouton "+ Ajouter un cabinet" → ouvre sheet vide avec formulaire
- [ ] Workflow d'envoi identique à la phase 2 mais en POST (nouvelle feature)
- [ ] Bouton "Supprimer" sur chaque cabinet (confirmation requise) :
      - Hard delete : retire la feature du tableau, commit "feat(cabinets): remove X"
- [ ] Bouton "Ajouter un département" si la liste évolue (rare)

### Phase 4 — Polish
- [ ] Prévisualisation du diff avant envoi (JSON pretty-print côté/side)
- [ ] Lien "Voir la PR" copiable dans le toast
- [ ] État de chargement (spinner sur les boutons)
- [ ] Gestion d'erreur réseau (token expiré → reconnexion auto)
- [ ] Mode sombre (déjà supporté par les styles globaux)
- [ ] Mobile : sheet devient bottom-sheet < 768px

### Phase 5 — Pré-requis (avant tout ça)
- [ ] Merger `security/xss-csp-sri-hardening` vers `main` (CSP + SRI)
      pour que l'espace admin soit sécurisé dès le départ
- [ ] Pull `--rebase` côté local
- [ ] Déployer `main` à jour

## Convention de commits

```
feat(admin): structure de l'espace admin et auth GitHub OAuth
feat(admin): édition d'un cabinet avec PR auto
feat(admin): ajout et suppression de cabinet
feat(admin): preview diff avant envoi
```

## Hors périmètre (v1)

- Géolocalisation du cabinet sur la carte (le `cabinet.geojson` actuel n'a
  pas de `geometry` exploitable, on part du principe que les cabinets sont
  rattachés à des départements via `departements[]`)
- Édition des départements (les 103 départements viennent d'un fichier
  shapefile Natural Earth, on n'y touche pas)
- Édition collaborative en temps réel (overkill pour l'usage)
- Historique des modifications (Git fait déjà le job)

## Prochaine étape

**Phase 0b en attente de décision** : on part sur une GitHub App + Cloudflare
Worker (gratuit, ~30 min de setup, propre) ou tu veux une autre voie ?
