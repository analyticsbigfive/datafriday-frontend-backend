# BUG-028 — /predict-test monté sans aucun guard d'authentification

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Moyenne (surface non authentifiée exposée, données mock)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `router/index.js:373-379`

## Symptôme

Accès direct à l'URL `/predict-test` en prod sans authentification.

## Cause racine

La route est montée comme banc de test sans guard, y compris en production.

## Correction

Aucune à ce jour. Données mock seulement — pas de fuite de données réelles — mais surface non
authentifiée exposée.

## Risque de régression / à surveiller

Décider si ce banc de test doit être guardé, désactivé en prod, ou explicitement assumé comme
public.

## Références

- `docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #5
