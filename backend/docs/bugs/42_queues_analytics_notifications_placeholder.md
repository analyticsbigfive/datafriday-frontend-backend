# BUG-042 — Queues ANALYTICS/NOTIFICATIONS : processors 100% placeholder

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Sans impact actuel, à savoir avant d'en dépendre
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `processors/analytics.processor.ts:31-62`, `processors/notification.processor.ts:31-79`

## Symptôme

Aucun — ces queues ne sont jamais alimentées en prod aujourd'hui.

## Cause racine

Les processors existent et tournent, mais leur contenu est 100% placeholder (données à zéro,
`logger.log` sans action réelle) — rien n'est réellement traité.

## Correction

Aucune à ce jour — à implémenter le jour où ces queues seront réellement utilisées.

## Risque de régression / à surveiller

Ne pas supposer qu'un job poussé sur ANALYTICS/NOTIFICATIONS produit un effet réel avant d'avoir
vérifié le contenu du processor à ce moment-là.

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #4
