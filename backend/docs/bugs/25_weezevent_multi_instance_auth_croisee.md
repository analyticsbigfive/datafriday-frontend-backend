# BUG-025 — Multi-instance Weezevent : l'auth OAuth utilise les credentials de la 1ère intégration active pour toutes

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Critique — sync silencieusement fausse/cassée dès 2 intégrations Weezevent actives
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `weezevent-auth.service.ts:29-41,90-149`, `onboarding.service.ts:432-446`, `weezevent-integration.service.ts:196-224`

## Symptôme

Dès qu'un tenant a 2 intégrations Weezevent actives, l'authentification OAuth utilisée pour
synchroniser la 2ᵉ intégration est en réalité celle de la 1ère — sync silencieusement fausse ou
cassée pour toute intégration au-delà de la première.

## Cause racine

Le service d'authentification Weezevent récupère les credentials sans cibler explicitement
l'intégration demandée — il retombe sur la première intégration active trouvée.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

C'est le bug le plus sévère de ce domaine (impact données) — à traiter en priorité si un tenant a
ou prévoit d'avoir plusieurs intégrations Weezevent.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #1
