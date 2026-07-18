# BUG-89 — `StockLevel.elementId` sans FK : niveaux orphelins, workarounds en lecture

- **Statut** : ⚪ Diagnostiqué (purge des orphelins à valider avant toute FK)
- **Sévérité** : 🟡 Mineur (intégrité référentielle non garantie, compensée en code)
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `prisma/schema.prisma` (`StockLevel`), `src/features/logistics/logistics.service.ts:895-922`

## Symptôme

Un delete+recreate de config (builder v1) laisse des `StockLevel` pointant vers des `SpaceElement` disparus. `getStock` compense : filtre les niveaux dont l'élément n'existe plus ET ré-injecte des niveaux « orphelins » hors référentiel — logique de contournement en lecture à chaque appel.

## Cause racine

Pas de contrainte FK `StockLevel.elementId → SpaceElement.id` : rien n'empêche (ni ne nettoie) les danglings à la source.

## Correction

Aucune à ce jour — ajouter la FK ferait **échouer la migration** tant que des orphelins existent. Séquence cible : (1) inventorier les orphelins en prod, (2) décider purge vs rattachement (→ `docs/QUESTIONS_A_BERTRAND.md`), (3) FK `ON DELETE CASCADE` ou `SET NULL`, (4) retirer les workarounds de `getStock`.

## Risque de régression / à surveiller

Les workarounds de lecture doivent rester en place tant que la FK n'existe pas.

## Références

- BUG-34 (même famille : `Event.spaceId` sans FK)
