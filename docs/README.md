# Diagrammes CabinetsMAP

Cet index liste les diagrammes Mermaid (`.mmd`) qui documentent l'architecture actuelle.

## Disponibles

| Fichier | Type | Sujet |
|---|---|---|
| [architecture-admin.mmd](./architecture-admin.mmd) | flowchart | Vue systeme complete (frontend / backend / DB / secrets / SEO) |
| [sequence-edit-cabinet.mmd](./sequence-edit-cabinet.mmd) | sequenceDiagram | Flux complet d'une edition: auth -> listing -> edit -> live sync |
| [db-schema.mmd](./db-schema.mmd) | erDiagram | Schema Postgres Neon (cabinets, departements, admin_settings) |
| [security-zones.mmd](./security-zones.mmd) | flowchart | Zones de confiance + flux de securite + failles identifiees |
| [deployment-pipeline.mmd](./deployment-pipeline.mmd) | flowchart | Pipeline dev -> GitHub -> Vercel -> Neon |
| [roadmap-scaling.mmd](./roadmap-scaling.mmd) | flowchart | Roadmap v2/v3/v4 (hardening, production, scale out) |

## Visualisation

Ouvrir les `.mmd` dans VS Code avec l'extension **MermaidChart** (`MermaidChart.vscode-mermaid-chart`) pour preview live.

Commandes utiles :
- **MermaidChart: Preview Diagram** — preview cote editeur
- Copier le contenu dans https://mermaid.live/ pour rendu partageable
