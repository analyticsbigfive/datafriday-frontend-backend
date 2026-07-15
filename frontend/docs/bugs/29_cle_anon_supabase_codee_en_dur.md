# BUG-029 — Clé anonyme Supabase codée en dur

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (hygiène — la clé anon est publique par design, pas une fuite)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/lib/supabase.js:6-7`

## Symptôme

Aucun — la clé anonyme Supabase est publique par design, ce n'est pas une fuite de secret.

## Cause racine

La clé est codée en dur dans le fichier source au lieu de passer par une variable d'environnement
— question d'hygiène/convention, pas de risque de sécurité direct.

## Correction

Aucune à ce jour — migrer vers une variable d'env pour la cohérence avec le reste du projet.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #7
