# BUG-039 — Audit/Webhooks (core) : infrastructure complète mais zéro appelant

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Fonctionnalité annoncée par le code mais absente en réalité
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/core/audit/audit.service.ts`, `src/core/webhooks/webhooks.service.ts`

## Symptôme

Les tables `AuditLog`/`Webhook`/`WebhookLog` sont vides et non atteignables en pratique — aucune
action utilisateur n'est tracée malgré la présence du modèle et du service.

## Cause racine

`AuditService.log()`/`findByEntity()`/`findByTenant()` et
`WebhooksService.dispatch()`/`findAll()`/`create()`/`update()`/`remove()`/`getLogs()` n'ont aucun
appelant externe (vérifié par grep sur tout `src/`) — aucun contrôleur n'expose ces méthodes.

## Correction

Aucune à ce jour — soit câbler un vrai usage (audit trail réel, webhooks sortants), soit retirer ce
module s'il n'est plus dans la feuille de route.

## Risque de régression / à surveiller

Ne pas prendre ces tables comme source d'audit fiable tant que ce n'est pas câblé — un besoin de
traçabilité actuel doit chercher ailleurs (logs applicatifs).

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #1
