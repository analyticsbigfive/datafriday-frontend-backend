# BUG-009 — Déconnexion intempestive pendant l'édition (multi-onglets)

- **Statut** : 🟡 Corrigé partiellement — cause racine multi-onglets encore ouverte
- **Sévérité** : 🔴 Bloquant (perte de travail en cours d'édition)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-05

## Symptôme

Déconnexion intempestive pendant qu'un utilisateur édite un formulaire, en particulier lorsque
plusieurs onglets sont ouverts sur la même session.

## Cause racine

Le refresh token est à **usage unique**. Avec plusieurs onglets ouverts, un onglet consomme le
refresh token avant l'autre → le second onglet reçoit un token invalide et déclenche un broadcast
`SIGNED_OUT` qui déconnecte **tous** les onglets. Un décalage de `clockTolerance` côté serveur
aggravait le symptôme (rejet de tokens encore valides à cause d'un écart d'horloge).

## Correction

`clockTolerance` backend porté à 10s (2026-07-05). **La racine multi-onglets (refresh token à
usage unique non partagé entre onglets) n'est PAS corrigée.**

## Risque de régression / à surveiller

Le bug peut réapparaître dès qu'un utilisateur travaille avec plusieurs onglets ouverts
simultanément sur l'app. Un fix propre nécessiterait un partage du refresh token entre onglets
(ex. `BroadcastChannel` + mutex, ou refresh centralisé dans un service worker).

## Références

- —
