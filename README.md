# CabinetsMAP — Carte du réseau avocat CEGC

Application web légère (carte interactive + back-office d'administration) réalisée
pour le compte de la **CEGC** afin de visualiser le réseau de cabinets d'avocats
partenaires en France métropolitaine et outre-mer.

![Stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Vercel%20Functions-blue) ![Data](https://img.shields.io/badge/data-public%20professional%20info-green) ![RGPD](https://img.shields.io/badge/visitor-anonymous-brightgreen)

## 🗺️ C'est quoi ?

- Une **carte interactive** (MapLibre GL) affichant chaque cabinet partenaire, cliquable
  pour consulter sa fiche (adresse, contacts, tribunaux et cours d'appel couverts)
- Une **recherche** par nom de cabinet ou par département
- Un **back-office d'administration** protégé permettant de maintenir les données à jour
  (chaque modification est journalisée)
- Une couverture **France entière**, outre-mer compris (via des polygones Natural Earth)

## ⚖️ Cadre juridique et données

Ce projet a été réalisé **dans le cadre d'un CDD pour le compte de la CEGC**.

- Les informations publiées sur les cabinets sont des **informations professionnelles
  publiques** (nom, adresse professionnelle, contacts, zones d'intervention), vérifiables
  publiquement. **Aucune donnée personnelle n'est publiée** sans accord.
- **Aucune donnée personnelle de visiteur n'est collectée** : pas de tracking, pas de
  cookies publicitaires. Le seul cookie est la session d'administration (strictement nécessaire).
- Toute modification des données est **journalisée** (audit log) dans un but de sécurité
  et d'intégrité des données.
- Le code source est publié à titre informatif. **Tous droits réservés** — aucune licence
  open source n'est accordée ; toute réutilisation non autorisée est interdite.

## 🧱 Stack

| Couche | Techno |
|---|---|
| Frontend | JavaScript vanilla (ES modules), CSS pur — zéro framework |
| Cartographie | MapLibre GL 3.6 |
| API | Vercel Functions (Node ESM) |
| Base de données | Neon Postgres (serverless) |
| Hébergement | Vercel |
| Déploiement | CLI Vercel (`vercel --prod`) |
| Tests | Suite E2E maison (`scripts/test-admin-e2e.mjs`), 54 assertions |

## 📁 Structure

```
├── admin.html              # Back-office (session protégée)
├── index.template.html     # Template de la page carte
├── api/                    # Vercel Functions (auth, cabinets, historique)
├── assets/                 # JS/CSS front + back-office
├── neon/                   # Schéma SQL Neon
├── scripts/                # Build, tests, cache-busting, géocodage one-time
└── ne_10m_admin_0_countries/  # Natural Earth (domaine public)
```

## 🚀 Développement

Variables d'environnement requies : voir [`.env.example`](.env.example)
(`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SESSION_TTL_SECONDS`).

## 🗺️ Sources et crédits

- Géocodage initial : [Nominatim / OpenStreetMap](https://www.openstreetmap.org/copyright)
- Polygones outre-mer : [Natural Earth](https://www.naturalearthdata.com/) (domaine public)
- Rendu cartographique : [MapLibre GL](https://maplibre.org) (BSD-3)

## 📄 Contact

Toute question relative à ce site ou aux données publiées peut être adressée à
l'éditeur (voir les mentions légales du site).