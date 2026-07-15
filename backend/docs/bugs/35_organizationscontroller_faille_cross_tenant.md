# BUG-035 — OrganizationsController expose une faille cross-tenant (identique à P0-1, jamais corrigée ici)

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Critique — sécurité, accès cross-tenant
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `organizations.controller.ts:17-18`, `organizations.service.ts:16,47,80`

## Symptôme

Un utilisateur authentifié de N'IMPORTE quel tenant appelle `PATCH /api/v1/organizations/<id-d-un-autre-tenant>`
avec `{ plan: "ENTERPRISE" }` ou `DELETE .../organizations/<id>` → lit/modifie/suspend
l'organisation d'un tiers sans être super-admin ni membre de ce tenant.

## Cause racine

`OrganizationsController` ne vérifie pas que l'`id` ciblé correspond au tenant de l'appelant — même
classe de faille que le P0-1 déjà documenté ailleurs dans l'audit auth (`PLAN_REMEDIATION_AUTH_PROD.md`),
mais jamais corrigée sur ce contrôleur spécifique.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

**Priorité de correction la plus haute de tout le lot** — c'est une faille d'isolation multi-tenant
exploitable directement par n'importe quel compte authentifié, pas seulement un cas limite.

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #1
- `docs/PLAN_REMEDIATION_AUTH_PROD.md`
