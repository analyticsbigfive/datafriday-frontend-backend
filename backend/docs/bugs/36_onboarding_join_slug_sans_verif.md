# BUG-036 — POST /onboarding/join/:slug déprécié mais actif, sans vérification de code

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Moyenne (sécurité — accès non invité à un tenant)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `onboarding.controller.ts:182-201`, `onboarding.service.ts:100-173`

## Symptôme

Connaître ou deviner le `slug` d'une organisation (souvent dérivé du nom de l'orga) suffit pour
rejoindre ce tenant en rôle `VIEWER`, sans invitation ni code de vérification.

## Cause racine

La route est marquée dépréciée mais reste montée et fonctionnelle, sans le contrôle de code que le
chemin recommandé (join-by-code) impose.

## Correction

Aucune à ce jour — désactiver la route ou lui ajouter la même vérification que join-by-code.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #3
