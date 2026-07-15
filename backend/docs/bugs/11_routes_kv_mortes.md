# BUG-011 — Routes /kv mortes (KvModule non enregistré)

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (code mort, pas de risque fonctionnel direct connu)
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-05 (génération de la doc API)

## Symptôme

Les routes `/kv` existent dans le code mais ne répondent pas / ne sont pas exposées par
l'application.

## Cause racine

`KvModule` n'est pas enregistré dans le module racine de l'application — ses routes sont donc
mortes.

## Correction

Aucune — décision à prendre : soit enregistrer le module s'il est utile, soit supprimer le code
mort.

## Risque de régression / à surveiller

Vérifier qu'aucun code front ne dépend déjà silencieusement de ces routes avant de les supprimer.

## Références

- `docs/api/API_REFERENCE.md` (généré via `pnpm docs:api`)
