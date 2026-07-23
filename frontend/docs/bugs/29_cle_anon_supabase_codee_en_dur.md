# BUG-029 — Clé anonyme Supabase codée en dur

- **Statut** : 🟡 Corrigé non déployé (2026-07-22)
- **Sévérité** : 🟢 Faible (hygiène — la clé anon est publique par design, pas une fuite)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/lib/supabase.js:6-7`, `.env` (local, non versionné)

## Symptôme

Aucun — la clé anonyme Supabase est publique par design, ce n'est pas une fuite de secret.

## Cause racine

La clé est codée en dur dans le fichier source au lieu de passer par une variable d'environnement
— question d'hygiène/convention, pas de risque de sécurité direct.

## Correction

2026-07-22 : `supabaseUrl`/`supabaseAnonKey` (`src/lib/supabase.js`) lus depuis
`process.env.VUE_APP_SUPABASE_URL`/`VUE_APP_SUPABASE_ANON_KEY` (convention Vue CLI, même préfixe que
`VUE_APP_API_URL`), valeurs ajoutées à `.env` local (non versionné). **À ajouter aux variables d'env
de chaque environnement de déploiement (staging/production) avant de merger/déployer**, sans quoi le
build cassera au démarrage (`createClient` avec `url`/`key` `undefined`).

## Risque de régression / à surveiller

—

## Références

- `docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #7
