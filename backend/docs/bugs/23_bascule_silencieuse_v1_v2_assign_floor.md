# BUG-023 — Bascule silencieuse v1→v2 dès le premier `assign-floor`

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (source de confusion en debug, pas de perte de données)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `spaces.service.ts:2973` (`spaceHasZones`)

## Symptôme

Un espace "v1 pur" peut se retrouver à router ses assignations suivantes en v2 dès qu'une seule
`Zone` existe pour cet espace (ex. créée par un `quick-element` antérieur) — invisible pour
l'utilisateur.

## Cause racine

`spaceHasZones` bascule le routage v1/v2 dès la présence d'UNE Zone, sans notification ni contrôle
explicite de l'utilisateur.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

Source possible de confusion en debug ("pourquoi ce shop est en Zone alors que je n'ai jamais
ouvert builder2 ?") — à garder en tête avant de diagnostiquer un ticket support sur ce sujet.

## Références

- `datafriday-web/docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #4
- `docs/adr/0002_builder_v2_relationnel_seul.md` (côté frontend, même famille de dette v1/v2)
