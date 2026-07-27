# BUG-009 — Déconnexion intempestive pendant l'édition (multi-onglets)

- **Statut** : 🟢 Corrigé
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

`clockTolerance` backend porté à 10s (2026-07-05). La racine multi-onglets a ensuite été corrigée
**côté frontend le 2026-07-18** (voir
[`frontend/docs/bugs/190_auth_signed_out_rotation_deconnexion_multi_onglets.md`](../../frontend/docs/bugs/190_auth_signed_out_rotation_deconnexion_multi_onglets.md),
🟢 Corrigé) : le vrai bug n'était pas l'absence de coordination entre onglets (Supabase auth-js
gère déjà ça nativement via `navigator.locks` + `BroadcastChannel`, vérifié dans
`node_modules/@supabase/auth-js`) mais une mauvaise interprétation de l'événement `SIGNED_OUT` côté
app — l'onglet qui perd la course de rotation du refresh token (à usage unique) reçoit un
`SIGNED_OUT` **inoffensif** de Supabase, que `onAuthStateChange` traitait à tort comme une vraie
déconnexion. Fix : extraction de la décision dans une fonction pure `resolveAuthStateChange`
(`frontend/src/utils/authSessionEvent.js`), qui distingue ce cas du `SIGNED_OUT` réel avant de
déclencher `CLEAR_AUTH`. **Revérifié le 2026-07-24** (session de fix de bugs backend) : confirmé
toujours en place sur `develop`, tests verts (19/19).

## Risque de régression / à surveiller

Revérifier ce comportement si le JWT `expiresIn` est raccourci (BUG-37, cf.
`08_AUTH_ONBOARDING.md`) — la rotation devient plus fréquente, donc la course multi-onglets plus
facile à reproduire/observer en usage réel.

## Références

- [`frontend/docs/bugs/190_auth_signed_out_rotation_deconnexion_multi_onglets.md`](../../frontend/docs/bugs/190_auth_signed_out_rotation_deconnexion_multi_onglets.md)
