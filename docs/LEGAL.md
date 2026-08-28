# Cadre légal et responsabilités — CabinetsMAP

> Document de référence juridique. **À faire valider par un professionnel du droit avant publication définitive.** Dernière mise à jour : 2026-08-28.

## 1. Qualification du service

CabinetsMAP est un **annuaire cartographique professionnel** : il publie des informations sur des cabinets d'avocats (adresse, contacts, zones d'intervention). Il ne s'agit pas :

- d'un service judiciaire ou d'aide juridictionnelle ;
- d'un intermédiaire entre avocats et clients ;
- d'un traitement automatisé de décisions.

C'est un **site vitrine d'information**, ce qui simplifie significativement le cadre juridique.

## 2. Nature des données publiées

| Donnée | Nature juridique | Base |
|---|---|---|
| Nom du cabinet | Donnée professionnelle | Publication légitime — les avocats exercent dans un cadre public réglementé |
| Adresse, téléphone, emails professionnels | Coordonnées professionnelles | Idem — elles sont destinées à être publiées (annuaires des barreaux, sites des cabinets) |
| Tribunaux, cours d'appel, départements | Zones d'activité professionnelle | Information factuelle |
| Couleur du point | Choix esthétique éditorial | — |

**Point clé : aucune donnée personnelle de personne physique n'est publiée** (pas de nom d'avocat individuel sauf si le cabinet est une personne physique exerçant sous son nom, ce qui est de l'information professionnelle publique au même titre que l'annuaire de l'ordre).

## 3. RGPD — Analyse

### 3.1 Données traitées

- **Côté public :** consultation anonyme. Aucun cookie de tracking, aucune mesure d'audience personnelle, aucun compte utilisateur.
- **Côté admin :** un compte administrateur unique. Données traitées : mot de passe (hashé bcrypt), adresse IP et user-agent (journal d'audit), historique des modifications.

### 3.2 Base légale

- **Journal d'audit admin** (IP, user-agent, horodatage) : intérêt légitime **sécurité** (art. 6.1.f RGPD) — détection des accès non autorisés, traçabilité des modifications de données. Les logs ne sont **pas** exposés publiquement.
- **Durée de conservation recommandée :** 12 mois pour les logs de connexion, puis purge. (À implémenter : une purge automatique au-delà de 30 jours n'existe pas encore pour les login — l'historique affiché, lui, est déjà limité à 30 jours.)

### 3.3 Formalités

- **RC Pro / registre des traitements :** consigner le traitement "journal d'audit admin" dans le registre (base : sécurité).
- **Aucune DPIA requise** : pas de données sensibles, pas de suivi massif, pas de profilage.
- **Pas de DPO obligatoire** (pas de traitement à grande échelle de données personnelles).
- **Cookies :** le seul cookie est `admin_session` (strictement nécessaire, exempté de consentement art. 82 loi Informatique et Libertés). Aucun bandeau cookies nécessaire côté public.

## 4. Sources de données tierces — conformité

| Source | Usage | Obligation |
|---|---|---|
| **Nominatim (OpenStreetMap)** | Géocodage initial one-time | Respect de la politique d'usage OSM : attribution requise si données affichées, pas de requêtes massives. Le géocodage étant one-time et en cache, la charge est nulle. **Mention "Coordonnées géocodées © OpenStreetMap contributors (Nominatim)" recommandée dans les mentions.** |
| **Natural Earth** | Polygones outre-mer | Domaine public — pas d'obligation, attribution appréciée |
| **MapLibre GL** | Bibliothèque de rendu | Licence BSD-3 — attribution dans le code source, pas d'obligation d'affichage |
| **Fonts Google (Lato, EB Garamond)** | Typographie | Licence open font, autorise l'hébergement Google Fonts (la CNIL a validé l'usage si auto-hébergé ; l'appel à fonts.googleapis.com expose l'IP du visiteur à Google — **point à surveiller**, voir §7) |
| **unpkg.com** | CDN MapLibre | Pareil : l'IP du visiteur transite par le CDN |

## 5. Responsabilités des utilisateurs

### 5.1 Administrateurs du réseau (rédacteurs des données)

- Garantissent **l'exactitude et l'actualité** des informations publiées (obligation de mise à jour).
- Ne publient que des informations **professionnelles et publiables** (coordination avec les cabinets concernés).
- Conservent l'accès au back-office **confidentiel** (mot de passe robuste, pas de partage de session).
- Toute modification est **tracée et journalisée** (patrimoine de preuve en cas de litige).

### 5.2 Cabinets partenaires (donnés)

- Leur présence sur la carte et leurs coordonnées sont publiées **au titre de leur appartenance au réseau** ; il appartient au réseau de s'assurer que chaque cabinet a **accepté cette publication** (accord contractuel recommandé — clause "présence sur l'annuaire cartographique du réseau" dans la convention).
- Chaque cabinet peut **demander la correction ou le retrait** de ses informations à tout moment ; la demande est traitée par l'administrateur.

### 5.3 Visiteurs du site public

- Consultation libre, sans compte, sans collecte.
- **Ne pas tenter d'accéder** à l'espace d'administration sans autorisation (mention dans les CGU).
- Les informations affichées sont **indicatives** : le site ne garantit pas l'absence d'erreur et **n'organise pas de mise en relation** — le visiteur contacte le cabinet de son plein gré.

## 6. Mentions légales à publier (obligations françaises)

Un site non marchand publié en France doit afficher :

1. **Éditeur** : nom/dénomination, forme juridique, adresse, contact (pour un professionnel : SIREN + RCS)
2. **Directeur de la publication** (nom du responsable)
3. **Hébergeur** : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA (+ contact)
4. **Liens vers** : politique de confidentialité (courte, cf. §3), CGU si le site en comporte

**Statut à préciser par le porteur du projet :** qui est l'éditeur ? (Association CEGC ? SEL ? Particulier ?) — c'est la seule information manquante que je ne peux pas remplir à ta place.

## 7. Points d'attention recommandés

| Sujet | État | Action recommandée |
|---|---|---|
| Consentement cookies | Non requis (aucun tracking) | Rien à faire, le documenter dans les mentions |
| Google Fonts (IP vers Google) | En place | Pour une conformité stricte (jurisprudence régionale allemande), **auto-héberger les polices** — petit chantier, non bloquant |
| CDN unpkg (IP vers tiers) | En place | Idem : auto-héberger `maplibre-gl.js`/`.css` dans `assets/` — recommandé aussi pour la résilience |
| Politique de confidentialité | Absente | Créer une page courte "Confidentialité" liée depuis le footer |
| Mentions légales | Absentes | Créer la page "Mentions légales" (§6) |
| Durée logs | Illimitée actuellement | Ajouter une purge des `admin_logs` de connexion > 12 mois (les modifications cabinets peuvent être conservées plus longtemps, utiles comme historique métier) |
| Accord de publication des cabinets | À vérifier | S'assurer que la convention réseau couvre la publication cartographique |

## 8. Ce que ce document N'EST PAS

Ce document est une **cartographie d'analyse**, rédigée par un outil technique. Ce n'est **pas un avis juridique**. Avant publication commerciale :

- Faites relire les mentions légales et la politique de confidentialité par un avocat (c'est le cœur de métier de vos partenaires !)
- Vérifiez le statut de l'éditeur et la publication au RCS le cas échéant
- Conservez les preuves d'accord des cabinets sur la publication de leurs données