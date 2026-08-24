# BUG-357-01 — Analyse : OOM backend (> 2 GB) sur espaces à gros historique — batchs de 77 events en une requête

- **Statut** : 🟡 Corrigé non déployé (+ action infra recommandée)
- **Sévérité** : 🔴 Bloquant/impact business (backend en crash-loop, page à 0 € partout)
- **Domaine** : Analyse & agrégation / Technique
- **Repo(s) concerné(s)** : `datafriday-web` (correctif) — infra Render (mitigation)
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/api/endpoints/space.api.js` (`_fetchBatchChunked`, `BATCH_CHUNK_SIZE`)

## Symptôme

Espace Stade Jean Bouin (`cmsufah9p0c08gpkz2wsg5pzo`) : à l'ouverture de l'Analyse, page à
**0 € partout** — « No sales detail available for this scope », tous les events à 0.00 € /
0 units — alors que la base contient 2,87 M€ de ventes valides (94 % mappées, 11 432
lignes d'agrégat pour le seul SFP-La Rochelle, toutes dans le scope des 54 PdV).

Côté Render, l'instance backend **crashe en boucle** : « Ran out of memory (used over
2GB) » à 15:17, 15:19, 15:23, 15:25… à chaque ouverture de la page, depuis le déploiement
de 14:50 (merge develop → staging). Le front reçoit des erreurs, met `[]` en cache
(« tenté »), et peint l'état vide — indistinguable d'un « pas de ventes » sans regarder
les logs Render.

## Cause racine

L'espace a **77 events**. Au chargement, la page envoyait les 77 fenêtres en **une seule
requête** à chacun des trois endpoints batch, en parallèle :

- `GET /spaces/:id/event-timeline?eventIds=<77>` — dedup CTE sur 275 715 lignes de
  `SpaceRevenueMinuteItemAgg`, résultat entier matérialisé en JS ;
- `GET /spaces/:id/transaction-baskets?eventIds=<77>` — scan brut de 376 456 lignes de
  `WeezeventTransaction ⋈ Item`, `ARRAY_AGG` par ticket ;
- `GET /spaces/:id/analyse-unmapped?eventIds=<77>` — second scan brut (nouveau, BUG-137-01).

Node matérialise les rows pg + le `JSON.stringify` de chaque réponse → pic mémoire > 2 GB
→ OOM. Facteurs aggravants du lot du 24/08 : cap paniers passé de 50 à 100 events
(BUG-354-01 — 77 réels au lieu de 50 sur cet espace), endpoint unmapped ajouté,
`useShopPerformance` qui charge timeline + paniers ensemble. Le Mans FC (20 events)
passait sans bruit ; Jean Bouin a franchi le seuil.

## Correction

`src/api/endpoints/space.api.js` — les trois appels batch passent par
`_fetchBatchChunked(spaceId, path, ids, chunkSize)` : paquets de **15 events**
(30 pour unmapped, réponse minuscule), envoyés en **séquentiel** — volontairement pas en
parallèle : un seul gros SELECT à la fois par client, la mémoire backend est bornée par la
taille d'un paquet, quel que soit le nombre d'events de l'espace. Les caches par event et
les maps inflight existants sont inchangés (le découpage est interne au fetch).

**Mitigation infra recommandée en plus** : passer l'instance Render à 4 GB — le chunking
borne le pic par client, pas le cumul de N utilisateurs simultanés sur de gros espaces.

## Risque de régression / à surveiller

- Latence : 77 events = 6 requêtes séquentielles au lieu d'1. Sur un espace sain c'est
  quelques centaines de ms de plus, masquées par les squelettes (`kpiSourceState`) ; c'est
  le prix de ne plus tuer le backend.
- Si un paquet échoue, tout le batch rejette (comportement d'avant conservé : échec global
  → `[]` par event + signalement). Une reprise par paquet réussi est une amélioration
  possible, pas indispensable.
- Le vrai plafond long terme est côté backend (streaming/pagination des gros SELECT,
  limites par requête) — à traiter si des espaces > 200 events apparaissent.

## Références

- Fiches liées : [BUG-354-01](354_01_transactions_comptent_des_lignes.md) (cap 50→100),
  api BUG-137-01 (endpoint unmapped), [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md)
  (états loading/empty qui ont au moins rendu l'échec lisible), api BUG-138-01 (l'autre
  incident du jour — les deux se ressemblent : des plafonds silencieux).

---

*JLH*
