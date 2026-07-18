# BUG-77 — `/analyse/*` : Swagger décrit des réponses qui n'existent pas, `?spaceId=` silencieusement ignoré

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟠 Majeur (contrat API mensonger ; scoping espace inopérant)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux (backend = cause ; front = ex-consommateur, chaîne morte — voir `datafriday-web/docs/bugs/149_chaine_analyse_api_morte_supprimee.md`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/analyse/analyse.controller.ts` (schemas), `src/features/analyse/analyse.service.ts:11-38`

## Symptôme

1. Swagger de `GET /analyse/dashboard` documentait `{totalRevenue, totalEvents, totalCost, averageMargin, topMenuItems}` alors que l'implémentation renvoie des **compteurs d'entités** `{menuItems, components, ingredients, suppliers, events, spaces}`. Idem `kpis/menu` et `kpis/events` (arrays par-item/par-event documentés, objets agrégés renvoyés) et `cost-breakdown` (ventilation ingrédients/packaging documentée, top-20 marge renvoyé).
2. Le front envoyait `?spaceId=` aux 4 endpoints ; aucun controller ne lisait ce paramètre → réponses **tenant-wide** quel que soit l'espace demandé.

## Cause racine

Swagger écrit d'après une spec cible jamais implémentée ; les controllers ne déclaraient aucun `@Query('spaceId')`. Aggravant découvert pendant l'audit : côté front, l'unique consommateur (`loadSpaceLightweight`) n'était **jamais dispatché** et ses buckets jamais lus — personne n'a donc jamais vu les chiffres faux (voir fiche front 149).

## Correction

2026-07-18 :
- Schemas Swagger des 4 endpoints alignés sur les réponses réelles (`analyse.controller.ts`).
- `spaceId` optionnel accepté et appliqué là où il a un sens : `getDashboard` (compteur d'events scopé) et `getEventKpis` (agrégat scopé). Menu/cost-breakdown documentés tenant-level (les MenuItems ne sont pas scoping-space par nature).
- Filtrage défensif `Event.spaceId` (pas de FK — cf. BUG-34).
- Specs : `analyse.service.spec.ts` (scoping spaceId présent/absent, référentiels non scopés).

## Risque de régression / à surveiller

Aucun consommateur front actif. Si un client externe lisait ces endpoints, la réponse n'a **pas changé de forme** (sauf scoping opt-in via `spaceId`) — seul Swagger dit désormais la vérité.

## Références

- BUG-15 / BUG-16 / BUG-30 (sémantiques TTC/HT et périmètres, volontairement non tranchés ici)
- `datafriday-web/docs/bugs/149_chaine_analyse_api_morte_supprimee.md`
