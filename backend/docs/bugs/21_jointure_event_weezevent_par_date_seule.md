# BUG-021 — Jointure Event ↔ WeezeventEvent par égalité de DATE seule dans la RPC

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (latent — pas de cas observé aujourd'hui)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : RPC `20260704200000_...sql:175-178,224-227` (`get_space_shop_details`)

## Symptôme

Deux events Weezevent le même jour calendaire sur le même espace risquent d'être confondus par la
jointure.

## Cause racine

La RPC `get_space_shop_details` joint `Event` DataFriday et `WeezeventEvent` par égalité de date
seule, sans autre discriminant (nom, heure, id externe).

## Correction

**Analysé en profondeur le 2026-07-21, délibérément non corrigé maintenant** — décision motivée,
pas un oubli :

- `Event` n'a **aucun champ** de liaison directe vers `WeezeventEvent` (pas de `weezeventEventId`)
  — la date est le SEUL lien, par conception d'origine, pas un oubli de jointure isolé.
- Un vrai fix "sans risque" nécessiterait soit (a) un champ de liaison explicite rempli au moment
  du rapprochement — ce qui suppose une UX de désambiguïsation à concevoir pour l'utilisateur
  quand 2 events tombent le même jour (décision produit, pas technique), soit (b) une heuristique de
  repli (nom, proximité d'horaire) qui pourrait silencieusement associer le mauvais event — pas
  moins risqué que le bug actuel, juste différemment risqué.
- Envisagé un temps un fix "purement technique" (rendre la jointure déterministe via un
  `LATERAL ... ORDER BY proximité horaire LIMIT 1` plutôt qu'un `LEFT JOIN` qui peut faire
  fan-out silencieusement si 2 candidats matchent). Écarté : ça ne corrige pas le vrai problème
  (quel event est *le bon*), ça masquerait juste un doublon d'affichage en pariant sur l'horaire —
  un pari qui peut être faux, sur une RPC financière en production, sans suite de tests automatisée
  pour le vérifier. Le rapport coût/risque n'est pas favorable pour un bug à "0 cas observé".

## Risque de régression / à surveiller

Le risque augmente avec le nombre d'événements multi-quotidiens sur un même espace — à surveiller
si ce cas d'usage se développe. Si un cas réel apparaît : commencer par (a) un champ de liaison
explicite + UX de désambiguïsation, pas par une heuristique de repli.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #8
