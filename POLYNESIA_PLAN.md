# Plan d'action : Rendu fidèle de la Polynésie française (987)

## Objectif principal

**La Polynésie doit être traitée au même niveau que tous les autres départements** : visible, lisible, consultable. Elle ne doit pas être un cas dégradé ou un schéma simplifié à peine reconnaissable.

## État final (terminé)

La Polynésie (987) est rendue via une approche « îles principales uniquement » :

- Seuls les 3 polygones avec ≥ 30 points sont conservés :
  - **poly 41** (Tahiti) : 46 points, taille réelle 0.49° × 0.38°
  - **poly 51** (Hiva Oa, Marquises sud) : 39 points, taille réelle 0.36° × 0.16°
  - **poly 54** (Nuku Hiva, Marquises nord) : 37 points, taille réelle 0.25° × 0.17°
- Les 85 autres polygones (atolls) sont masqués.
- Chaque île est étiquetée (Tahiti, Hiva Oa, Nuku Hiva).
- Les archipels secondaires (Tuamotu, Gambier, Australes) ne sont **pas** représentés : seules les 3 îles principales figurent.
- La note « échelle non respectée » a été retirée.

### Correspondance géographique (vérifiée)

| Poly | Île | Centroïde réel | Position dans l'inset |
|------|-----|----------------|------------------------|
| 41 | Tahiti | −149.4°, −17.7° | [0, 0] (SO) |
| 51 | Hiva Oa | −139.0°, −9.8° | [2.2, 1.3] (SE) |
| 54 | Nuku Hiva | −140.1°, −8.9° | [2.6, 2.5] (NE) |

Nuku Hiva est la plus au nord (lat −8.9°), Hiva Oa la plus au sud (lat −9.8°).

### Fichiers concernés

- `assets/map.js` : `POLYNESIA_ISLAND_LABELS`, `POLYNESIA_ISLAND_LAYOUT`, `makeMainIslandsOnly`, `layoutPolynesiaIslands`, `collectIslandLabels`, `createPolynesiaLabels`, branche `isMainIslandsOnly` dans `createInsetFeature`.
- `assets/styles.css` : classe `.polynesia-island-label` (la classe `.polynesia-scale-note` a été supprimée).
- `assets/config.js` : `slotSizes` du pacifique à `[4.5, 7.8]`.
- `index.html` : régénéré via `python3 scripts/build_index.py`.

## Décisions prises

- **Archipels secondaires** : non représentés (option « rien » retenue). Les 3 îles principales représentent la Polynésie.
- **Note d'échelle** : retirée.
- **Noms des îles** : corrigés — poly 51 = Hiva Oa, poly 54 = Nuku Hiva (précédemment inversés).

## Prochaine étape

Recharger la page et vérifier visuellement le rendu (positions, labels, clic/hover sur chaque île).
