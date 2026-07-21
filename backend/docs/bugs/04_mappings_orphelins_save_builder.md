# BUG-004 — Mappings orphelins après sauvegarde du builder

- **Statut** : 🟢 Corrigé (confirmé le 2026-07-21 — le fix existait déjà en code, non documenté)
- **Sévérité** : 🟠 Majeur (démapping silencieux Data Integration)
- **Domaine** : Intégrations & ventes / Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-28
- **Confirmé corrigé le** : 2026-07-21
- **Fichiers** : `src/features/spaces/spaces.service.ts` (`saveConfiguration`, `reconcileElement`) ;
  `prisma/schema.prisma` (`model LocationShopMapping`, `@@map("WeezeventLocationShopMapping")`)

## Symptôme

Après une sauvegarde de la configuration du builder (`saveConfiguration`), des mappings de
produits (Data Integration) deviennent orphelins : un produit apparaît "démappé" côté wizard alors
qu'il avait été mappé correctement avant la sauvegarde.

## Cause racine

`SpaceElement.id` est régénéré à chaque `saveConfiguration` — le backend fait un
`delete + recreate` des éléments plutôt qu'un `update`. Tout mapping qui référence l'ancien
`SpaceElement.id` devient donc orphelin dès qu'un utilisateur re-sauvegarde le builder, même sans
changement de fond sur cet élément.

## Correction

**Confirmé corrigé le 2026-07-21** — root cause identifiée le 2026-06-28, mais la fiche n'avait
jamais été mise à jour malgré un fix déjà présent en code (aucune trace du fix dans les notes de
session ; retrouvé en relisant `saveConfiguration` en profondeur, à la demande explicite de
l'utilisateur, dans le cadre de la revue du module Intégrations & ventes du 2026-07-21). Ce builder
(Floor/Forecourt, dit "v1") reste actif dans l'app aujourd'hui malgré la bascule produit vers le
"builder2" (Zone) — sa dépréciation/suppression est un chantier séparé, sans lien avec ce bug.

Le `delete+recreate` a été remplacé par un **reconcile** (upsert en place) :
- `saveConfiguration` (`spaces.service.ts:1727` s.) : matche chaque `Floor`/`SpaceElement` reçu par
  id (sinon par niveau pour les floors) → `UPDATE` s'il appartient à cette config, `CREATE`
  uniquement si absent — `SpaceElement.id` devient **immuable** tant que l'élément n'est pas
  réellement supprimé par l'utilisateur.
- **Éléments protégés** : tout `SpaceElement` porteur d'un `WeezeventLocationShopMapping` n'est
  **jamais supprimé** par le prune (étape 4b), même absent du payload reçu — un garde-fou
  supplémentaire (étape 2a) va jusqu'à **ré-injecter** l'élément mappé dans le payload s'il en était
  totalement absent (cas d'un bug client/race), avec un log explicite.
- `WeezeventLocationShopMapping.spaceElementId` a en plus gagné une vraie **FK** vers
  `SpaceElement.id` (`ON DELETE CASCADE`) — l'ancien champ `String` sans contrainte qui permettait
  un pointeur mort silencieux n'existe plus ; si un élément mappé était un jour réellement supprimé,
  son mapping partirait proprement avec lui plutôt que de traîner en pointeur mort.

### Vérification (2026-07-21)

Reproduit le scénario exact suggéré par cette fiche ("mapper un produit, sauvegarder le builder
sans rien changer, vérifier si le mapping survit") via le vrai `SpacesService.saveConfiguration()`
(pas un mock), sur un tenant/espace/config jetables créés puis supprimés après coup :
- **Cas nominal** (resave à l'identique) : `SpaceElement.id` inchangé, mapping toujours présent et
  pointant vers un élément réel. ✅
- **Cas pire** (element mappé totalement absent du payload de sauvegarde) : mapping quand même
  préservé, élément toujours en base, ré-injecté dans le JSON persisté (log `[saveConfiguration]
  Re-injected 1 Weezevent-mapped element(s)...`). ✅
- FK réelle confirmée en base (`psql \d "WeezeventLocationShopMapping"`, pas seulement dans
  `schema.prisma` — cf. BUG-107 pour un cas où schema.prisma et la base réelle avaient divergé).

## Risque de régression / à surveiller

Aucun identifié : les deux scénarios de reproduction (resave à l'identique, resave avec élément
mappé absent du payload) préservent le mapping. À surveiller uniquement si le builder v1 est un
jour effectivement supprimé (chantier séparé, mentionné par l'utilisateur) : s'assurer que la
suppression ne casse pas les mappings existants au moment de la migration/suppression.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md`
