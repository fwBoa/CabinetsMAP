# Setup Vercel pour CabinetsMAP

Guide pas-à-pas pour migrer le site de GitHub Pages vers Vercel
et préparer l'environnement de l'espace admin.

## Pré-requis

- Compte GitHub avec accès au repo `fwBoa/CabinetsMAP`
- Vercel Free Tier (gratuit, 100 GB/mois)

## Étape 1 — Créer le compte Vercel (2 min)

1. Aller sur https://vercel.com/signup
2. Cliquer "Continue with GitHub"
3. Autoriser Vercel à accéder à ton compte GitHub
4. Accepter le Free Tier (pas de CB requise)

## Étape 2 — Importer le repo (1 min)

1. Sur le dashboard Vercel, cliquer "Add New..." → "Project"
2. Chercher `fwBoa/CabinetsMAP` dans la liste
3. Cliquer "Import"
4. Sur l'écran de configuration :
   - **Project Name** : `cabinetsmap` (par défaut)
   - **Framework Preset** : "Other" (site statique)
   - **Build Command** : laisser vide
   - **Output Directory** : `.` (laisser par défaut)
   - **Install Command** : laisser vide
5. Ne PAS cliquer "Deploy" tout de suite. D'abord configurer les variables.

## Étape 3 — Configurer les variables d'environnement (5 min)

Avant le premier déploiement, ajouter les variables :

1. Sur l'écran de configuration Vercel, déployer la section "Environment Variables"
2. Ajouter une par une (voir [`.env.example`](.env.example) pour la doc détaillée) :

| Name | Value (exemple) | Environment |
|------|-----------------|-------------|
| `ADMIN_CODE_HASH` | `<sha256 de ton code>` | Production, Preview |
| `SESSION_SECRET` | `<openssl rand -hex 32>` | Production, Preview |
| `GITHUB_TOKEN` | `<ton PAT GitHub>` | Production |
| `GITHUB_REPO_OWNER` | `fwBoa` | Production, Preview |
| `GITHUB_REPO_NAME` | `CabinetsMAP` | Production, Preview |
| `GITHUB_DEFAULT_BRANCH` | `main` | Production, Preview |
| `ADMIN_SESSION_TTL_SECONDS` | `28800` | Production, Preview |

### Comment générer chaque valeur

**`ADMIN_CODE_HASH`** (hash SHA-256 du code d'accès) :

En local dans le terminal :
```bash
echo -n "TON_CODE_SECRET" | shasum -a 256
```
Sortie : `<hash>`. Copier cette valeur dans Vercel.

> **Important** : le code lui-même n'apparaît dans AUCUN fichier du repo.
> Tu es le seul à le connaître. Le hash seul ne permet pas de remonter au code.

**`SESSION_SECRET`** (32+ caractères aléatoires) :

```bash
openssl rand -hex 32
```
Sortie : 64 caractères hexa. Copier dans Vercel.

**`GITHUB_TOKEN`** (Personal Access Token) :

1. Aller sur https://github.com/settings/tokens
2. Cliquer "Generate new token" → "Fine-grained token"
3. Configurer :
   - **Token name** : `Vercel CabinetsMAP Editor`
   - **Expiration** : 90 days (ou plus, à toi de voir)
   - **Repository access** : "Only select repositories" → `fwBoa/CabinetsMAP`
   - **Permissions** :
     - Repository permissions :
       - **Contents** : Read and Write
       - **Pull requests** : Read and Write
       - **Metadata** : Read-only (par défaut, suffit)
4. Cliquer "Generate token"
5. **Copier immédiatement** le token affiché (il ne sera plus jamais visible)

## Étape 4 — Premier déploiement (1 min)

1. Après avoir ajouté toutes les variables, cliquer "Deploy"
2. Vercel build en ~30s (site statique, rien à compiler)
3. URL générée : `https://cabinetsmap.vercel.app` (ou similaire)

## Étape 5 — Vérifier que le site marche (1 min)

1. Ouvrir `https://<ton-projet>.vercel.app/` dans le navigateur
2. Vérifier que la carte s'affiche, que les cabinets apparaissent
3. Tester une recherche (ex: "BORDEAUX 33")
4. Visiter `https://<ton-projet>.vercel.app/admin.html`
   → pour l'instant, ça doit afficher une erreur 404 ou une page blanche
   → c'est normal, on n'a pas encore créé le code admin

## Étape 6 — Domaine personnalisé (optionnel, 5 min)

Si tu as un domaine (ex: `cabinetsmap.fr`) :

1. Sur Vercel : Project Settings → Domains
2. Ajouter ton domaine : `cabinetsmap.fr`
3. Vercel t'affiche les DNS à configurer chez ton registrar :
   ```
   Type A    @    76.76.21.21
   Type CNAME www  cname.vercel-dns.com
   ```
4. Aller chez ton registrar (OVH, Gandi…) et appliquer ces DNS
5. Attendre la propagation (5 min à 24h)
6. Vercel génère automatiquement un certificat SSL (Let's Encrypt)

## Étape 7 — Couper GitHub Pages (optionnel, après validation)

Quand tu es sûr que Vercel fonctionne bien :

1. GitHub → ton repo → Settings → Pages
2. Source : "None" (ou désactiver)
3. Le site ne sera plus servi par GitHub Pages

> Garde GitHub Pages actif en parallèle **pendant au moins une semaine**
> avant de couper, pour pouvoir rollback si Vercel a un souci.

## Coûts

| Ressource | Free Tier | Ton usage estimé |
|-----------|-----------|-------------------|
| Bande passante | 100 GB/mois | ~1-5 GB/mois |
| Builds | 6000 min/mois | ~10 min/mois (auto-deploy sur push) |
| Functions | 1M invocations/mois | ~100-500/mois |
| Custom domain | Gratuit | 0 |
| SSL | Gratuit | 0 |

**Total : 0 €.**

## Rollback

Si quelque chose ne va pas après la migration :

1. GitHub Pages est encore actif (on ne l'a pas coupé)
2. Aller sur GitHub → Settings → Pages → réactiver si besoin
3. Le temps que tu corriges, le site reste accessible via GitHub Pages

## En cas de problème

- **Build failed** : vérifier que `package.json` est bien à la racine
- **Variables d'env non prises en compte** : redéployer après ajout
  (Vercel ne rebuilte pas automatiquement sur changement d'env)
- **Page 404** : vérifier que `vercel.json` est commité
- **CORS error** : ajouter le domaine Vercel dans la liste blanche des origins
  (à configurer dans la Function, pas dans vercel.json)
