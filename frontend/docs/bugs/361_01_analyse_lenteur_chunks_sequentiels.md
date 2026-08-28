# BUG-361-01 — Analyse : chargement nettement ralenti par les paquets batch strictement séquentiels (suite BUG-357-01)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur (perception « les optimisations ont disparu »)
- **Domaine** : Analyse & agrégation / Performance
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (frontend)
- **Découvert le** : 2026-08-24 (signalement JLH + réunion du 24/08)
- **Fichiers** : `src/api/endpoints/space.api.js` (`_fetchBatchChunked`, `BATCH_CHUNK_SIZE`,
  `_BATCH_CONCURRENCY`)

## En clair

Le correctif anti-OOM du 24/08 (BUG-357-01) découpait les grosses requêtes en paquets envoyés
un par un, à la file. Résultat : sur un espace courant, la page attendait 5 à 7 allers-retours
serveur à la suite au lieu de 3 en parallèle — d'où la lenteur ressentie « comme si les
optimisations n'étaient plus en place ». Le correctif garde le découpage (qui protège la mémoire
du serveur) mais autorise deux paquets à voyager en même temps : la protection reste, l'attente
retombe.

## Symptôme

Page Analyse beaucoup plus lente qu'avant le 24/08 sur tout espace à plus de 15 events ; pas de
crash backend (l'OOM de BUG-357-01 ne se reproduit pas).

## Cause racine

`_fetchBatchChunked` (introduit par BUG-357-01, commit `7e2c2b4`) bouclait `await` par `await` :
paquets de 15 events envoyés **strictement en séquentiel** par endpoint. Trois endpoints batch
(event-timeline, transaction-baskets, analyse-unmapped) × ⌈N/15⌉ paquets = wall-clock ≈ somme de
tous les allers-retours. Le séquentiel intégral était une sur-correction : l'OOM venait de
requêtes de 77 events chacune, pas de deux paquets de 15 en vol.

## Correction

2026-08-24, branche `fix/event-predict-deeplink-event-passe` :

- `_fetchBatchChunked` passe en **concurrence bornée** : au plus `_BATCH_CONCURRENCY = 2`
  paquets en vol par endpoint (pool de workers sur compteur partagé). Taille de paquet inchangée
  (15 ; 30 pour analyse-unmapped).
- Borne mémoire backend résultante : 2 × 15 events par endpoint (≤ 6 SELECT de 15 events tous
  endpoints confondus dans le pire cas), loin des 3 × 77 de l'OOM Jean Bouin — et sous les
  3 × 50 qui passaient sans bruit avant le cap 100.
- Sémantique d'erreur inchangée : un paquet en échec rejette le batch entier (comme avant).

## Risque de régression / à surveiller

- Surveiller la mémoire Render à l'ouverture d'Analyse sur Stade Jean Bouin (77 events) — le
  scénario OOM de référence. Si récidive : redescendre `_BATCH_CONCURRENCY` à 1 redonne
  exactement le comportement BUG-357-01.
- Mesure avant/après à faire (DevTools Network, espace La Beaujoire Nantes) : nombre de requêtes
  simultanées et temps total de chargement.

— JLH
