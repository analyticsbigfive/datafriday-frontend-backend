# BUG-023 — Bascule silencieuse v1→v2 dès le premier `assign-floor`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (source de confusion en debug, pas de perte de données)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Corrigé le** : 2026-07-24
- **Fichiers** : `spaces.service.ts` — `spaceHasZones` (3 points de calcul : `assignElementsToFloorLevel`,
  `assignElementsToForecourt`, `assignElementsToExternalMerch`)

## Symptôme

Un espace "v1 pur" peut se retrouver à router ses assignations suivantes en v2 dès qu'une seule
`Zone` existe pour cet espace (ex. créée par un `quick-element` antérieur) — invisible pour
l'utilisateur.

## Cause racine

`spaceHasZones` bascule le routage v1/v2 dès la présence d'UNE Zone, sans notification ni contrôle
explicite de l'utilisateur.

## Correction

**Correction appliquée — observabilité uniquement.** Ce ticket portait sur le fait que la bascule
était *silencieuse*, pas sur la légitimité de la bascule elle-même : la logique de routage v1/v2
n'a pas été modifiée (aucune décision n'a été prise ici sur une éventuelle dépréciation de v1 —
sujet architecture distinct, toujours ouvert).

- Ajout d'un log structuré (`this.logger.warn`, `Logger` NestJS standard du projet) à chacun des 3
  points où `spaceHasZones` est calculé dans `spaces.service.ts` (`assignElementsToFloorLevel`,
  `assignElementsToForecourt`, `assignElementsToExternalMerch`), factorisé dans
  `logBuilderV2Switch()`. Le log n'est émis que lorsque la bascule se déclenche réellement
  (`spaceHasZones === true`) et inclut `spaceId`, `tenantId`, le nombre de zones et la fonction
  d'origine, pour permettre de retrouver l'espace concerné en debug/support.
- Ajout d'un champ additif `builderVersion: 'v1' | 'v2'` dans la réponse des 3 endpoints
  d'assignation (`kind: 'floor' | 'forecourt' | 'externalmerch'`). Aucun DTO/serializer strict ne
  filtre ces réponses côté backend (pas de `ClassSerializerInterceptor`), donc ce champ est
  purement additif et ne casse aucun consommateur existant (frontend ou autre) qui ignorerait déjà
  les clés inconnues.
- Test ajouté dans `spaces.service.spec.ts` (« BUG-23 — bascule v1→v2 silencieuse rendue
  observable... ») qui vérifie que le log `[BUG-23]` est émis avec `spaceId`/`tenantId` et que
  `builderVersion: 'v2'` est bien renvoyé quand une Zone existe déjà pour l'espace.

## Risque de régression / à surveiller

Aucun changement de comportement de routage — uniquement de l'observabilité ajoutée. Reste à
surveiller : la question de fond (faut-il déprécier v1 pour de bon, ou introduire un contrôle
explicite avant bascule) n'est PAS traitée ici et reste un sujet d'architecture séparé.

## Références

- `datafriday-web/docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #4
- `docs/adr/0002_builder_v2_relationnel_seul.md` (côté frontend, même famille de dette v1/v2)
