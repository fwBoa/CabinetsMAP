# Setup Vercel + Neon pour CabinetsMAP

Guide pas-à-pas pour déployer le site et préparer l'environnement
admin (édition directe en base Neon).

## Pré-requis

- Compte GitHub avec accès au repo `fwBoa/CabinetsMAP`
- Compte Vercel Free Tier (gratuit)
- Compte Neon (gratuit) — créé automatiquement par Vercel Storage

## Étape 1 — Importer le repo sur Vercel (1 min)

1. Dashboard Vercel → "Add New..." → "Project"
2. Chercher `fwBoa/CabinetsMAP` → "Import"
3. Configuration :
   - **Project Name** : `cabinetsmap`
   - **Framework Preset** : "Other"
   - **Output Directory** : `.` (laisser par défaut)
   - **Install/Build Command** : (laisser par défaut, le `vercel.json` s'occupe)
4. NE PAS cliquer "Deploy" tout de suite. D'abord Storage + env.

## Étape 2 — Créer la base Neon (2 min)

1. Sur l'écran de configuration Vercel, section **Storage** → "Create New"
2. Choisir **Neon Postgres** → "Continue"
3. Region : choisir `US East (Ohio)` ou `EU` selon ton audience
4. Cliquer "Create" → "Connect to Project"
5. Vercel injecte automatiquement **toutes** les variables Postgres
   (`DATABASE_URL`, `POSTGRES_URL`, `PGHOST`, `PGUSER`, etc.) en Preview +
   Production.

## Étape 3 — Configurer les variables admin (2 min)

Ajouter manuellement :

| Name | Value (exemple) | Environment |
|------|-----------------|-------------|
| `SESSION_SECRET` | `<openssl rand -hex 32>` | Production, Preview |
| `ADMIN_SESSION_TTL_SECONDS` | `28800` | Production, Preview |

> `DATABASE_URL` est déjà présent, créé automatiquement par Storage à l'étape 2.

### Générer `SESSION_SECRET`

```bash
openssl rand -hex 32
# Sortie : 64 caractères hexa. Copier dans Vercel.
```

### Changer le mot de passe admin

Le mot de passe par défaut est seedé dans `admin_settings` à l'init Neon.
Pour le changer en production :

```bash
DATABASE_URL="..." node neon/seed-admin.mjs
# (réponse interactive : nouveau mot de passe)
```

Ou en SQL direct :
```sql
-- le hash bcrypt doit être généré séparément (12 rounds min)
update admin_settings
set value = '<nouveau-bcrypt-hash>', updated_at = now()
where key = 'password_hash';
```

## Étape 4 — Premier déploiement (1 min)

Cliquer "Deploy" → build ~30s → URL : `https://cabinetsmap.vercel.app`.

## Étape 5 — Initialiser le schéma DB (1 min, une seule fois)

En local avec DATABASE_URL pointant sur la prod :

```bash
export DATABASE_URL="postgresql://..."  # copier depuis Vercel
node neon/run-schema.mjs                 # applique CREATE TABLE/INDEX
node neon/import-cabinets.mjs            # importe cabinets + départements
node neon/seed-admin.mjs                 # seed du mot de passe admin
```

> **À faire une seule fois** au premier setup. Les déploiements suivants
> ne touchent pas au schéma.

## Étape 6 — Vérifier que tout marche (2 min)

1. **Carte publique** : ouvrir `https://cabinetsmap.vercel.app/`
   → la carte s'affiche avec les 13 cabinets
2. **GeoJSON public** : `curl https://cabinetsmap.vercel.app/api/geojson/cabinets`
   → renvoie un `FeatureCollection` avec les features
3. **E2E tests** : `node scripts/test-admin-e2e.mjs`
   → 37 assertions, doit afficher `Passés : 37`
4. **Admin** : ouvrir `https://cabinetsmap.vercel.app/admin.html`
   → se connecter avec le mot de passe → modifier un cabinet → vérifier
     sur la carte publique dans la minute suivante (cache CDN)

## Étape 7 — Domaine personnalisé (optionnel)

Project Settings → Domains → ajouter ton domaine → configurer les DNS
chez ton registrar. SSL automatique via Let's Encrypt.

## Coûts

| Ressource | Free Tier | Ton usage estimé |
|-----------|-----------|------------------|
| Vercel bande passante | 100 GB/mois | ~1-5 GB/mois |
| Vercel Functions | 1M invocations/mois | ~100-500/mois |
| Neon Compute | 191.9h/mois (Active) | largement suffisant |
| Neon Storage | 512 MB | ~5 MB |
| SSL | Gratuit | 0 |

**Total : 0 €.**

## Rollback

Si Vercel a un souci : GitHub Pages est encore actif (le repo sert les
fichiers statiques aussi via GitHub Pages si configuré). Sinon, dernier
commit fonctionnel sur `main` → Vercel redéploie en quelques secondes.

## En cas de problème

- **Build failed** : vérifier `package.json` à la racine + `vercel.json`
- **`DATABASE_URL` non trouvée** : vérifier que Storage Neon est bien
  "Connected" au projet (Settings → Storage → Neon → Connect)
- **Login échoue avec 401** : le hash bcrypt dans `admin_settings` ne
  matche pas → réexécuter `node neon/seed-admin.mjs`
- **Mutation visible seulement après 60s** : cache CDN normal, attendre
  ou ajouter `?_=<timestamp>` à l'URL `/api/geojson/cabinets`
- **Carte publique vide** : vérifier que `cabinets.geojson` est bien
  commité et que `assets/main.js` charge bien `data/cabinets.geojson`
