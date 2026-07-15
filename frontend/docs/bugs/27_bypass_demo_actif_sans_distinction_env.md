# BUG-027 — Bypass démo (`?demo=1`) actif sans distinction dev/prod

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Moyenne (sécurité — accès non authentifié à des écrans protégés)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `router/guards.js:32-44`

## Symptôme

Naviguer avec `?demo=1` sur `/dashboard` contourne entièrement `requireOrganization` en
**production**.

## Cause racine

Le guard de route accepte `?demo=1` / `localStorage.analyse_demo` sans distinguer l'environnement
(dev vs prod).

## Correction

Aucune à ce jour — restreindre ce bypass à l'environnement de développement uniquement.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #4
