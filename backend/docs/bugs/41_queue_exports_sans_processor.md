# BUG-041 — Queue EXPORTS enregistrée dans BullMQ sans aucun processor

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Latent — aucun appelant de `queueExport()` aujourd'hui, mais piège prêt à se déclencher
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `queue.module.ts:41-47` (registerQueue), `:51-56` (providers, `EXPORTS` absent)

## Symptôme

Aucun aujourd'hui — mais un job poussé dans la queue `EXPORTS` resterait bloqué indéfiniment
(`waiting` permanent), sans erreur visible.

## Cause racine

La queue `EXPORTS` est enregistrée côté BullMQ (`registerQueue`) mais aucun processor n'est
déclaré dans les `providers` pour la consommer.

## Correction

Aucune à ce jour — ajouter le processor manquant avant tout usage réel de `queueExport()`.

## Risque de régression / à surveiller

Si un développeur ajoute un appel à `queueExport()` sans remarquer l'absence de processor, le
job restera silencieusement bloqué — vérifier ce point avant toute nouvelle fonctionnalité d'export
asynchrone.

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #3
