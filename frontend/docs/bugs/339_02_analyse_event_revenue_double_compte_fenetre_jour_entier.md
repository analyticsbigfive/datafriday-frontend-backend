# BUG-339-02 — Analyse : le CA d'un event peut inclure celui de l'event suivant (`resolveEventSalesScope` fenêtre au jour calendaire entier au lieu d'utiliser l'heure de fin déjà en base)

- **Statut** : ⚪ Diagnostiqué (root cause confirmée empiriquement, fix conçu, **pas implémenté**)
- **Sévérité** : 🔴 Bloquant/impact business (CA affiché faux sur la page Analyse, tenant client
  réel "Eat Is Family" — chiffre montré à l'utilisateur, pas juste un écran de debug)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-19 — Ulrich signale sur la page Analyse (Stade Jean Bouin, tenant
  `cmrpf3ukw0001bdu2h6rz0vbz`) : la carte "PFC - RC Lens" affiche d'abord ~46-48k€ (correct)
  pendant le chargement, puis se corrige à tort sur 184k€ une fois le chargement terminé. La
  carte "SFP-Toulouse" reste correcte (136k€) tout du long.
- **Fichiers** :
  - `backend/src/features/spaces/spaces.service.ts:1197-1300` (`resolveEventSalesScope` — calcule
    la fenêtre de vente par event, à corriger)
  - `backend/src/features/aggregation/aggregation.service.ts:249-` (`resolveEventWindow` — a déjà
    la bonne logique côté Data Integration, à porter ici)
  - `backend/src/shared/utils/event-window.util.ts` (`combineDayAndLocalTime`,
    `parseEventSessions` — fonctions pures déjà partagées, réutilisables telles quelles)
  - `backend/src/features/spaces/spaces.service.ts:1321-1420` (`getEventTimelineBatch`) et
    `~1517-1524` (`getTransactionBasketsBatch`) — consomment la fenêtre calculée par
    `resolveEventSalesScope`, aucun filtre sur `weezeventEventId` (volontaire, voir ci-dessous)
  - `frontend/src/components/analyse/AnalyseView.vue:856-865` (`chartRecords`, bascule silencieuse
    vers la source item-level dès que son fetch en arrière-plan aboutit — explique pourquoi le
    chiffre est correct puis faux, pas l'inverse)
  - `frontend/src/components/analyse/SummaryPanel.vue:531-550` (`topEvents`, la carte "Events
    Performance" qui affiche le chiffre faux)

## Symptôme

Espace "Stade Jean Bouin", carte event "PFC - RC Lens" (`eventDate` = 2026-02-14) sur la page
Analyse : CA affiché passe de ~46-48k€ (chargement initial, correct) à 184 441,43€ (faux) une
fois le chargement terminé. `Event.revenue`/`SpaceRevenueMinuteAgg` (source de vérité, calculée
par `executeProcessEvents`) donnent 48 277,27€ pour cet event.

**Preuve arithmétique** : 48 277,27€ (PFC - RC Lens, CA réel) + 136 164,16€ (SFP-Toulouse, le
match du **lendemain**, `eventDate` = 2026-02-15) = **184 441,43€** — colle exactement au chiffre
faux observé. Le CA de deux events différents est additionné.

## Cause racine

`resolveEventSalesScope` (`spaces.service.ts:1266-1270`) calcule la fenêtre de vente d'un event
uniquement au **jour calendaire** : `[eventDate, eventEndDate + 1 jour entier[`. Pour "PFC - RC
Lens", `eventEndDate` = 2026-02-15 (le lendemain du match — légitime, le match finit après
minuit, ventes du wallet cashless jusqu'à l'heure de fin réelle). La règle "+1 jour" (convention
métier documentée, décidée le 30/07, correcte en soi — `eventEndDate` = dernier jour INCLUS)
appliquée à cette date déjà "lendemain" produit une fenêtre de **2 jours calendaires entiers**
(14/02 00h00 → 16/02 00h00) au lieu d'une fenêtre resserrée sur les vraies heures d'activité.

`getEventTimelineBatch` (`spaces.service.ts:1363-1387`) joint ensuite `SpaceRevenueMinuteItemAgg`
**uniquement par cette plage de dates**, **sans filtre sur `weezeventEventId`** (choix volontaire
documenté ligne 1337-1344 : les deux pipelines d'écriture taguent ce champ avec des conventions
d'id différentes, un filtre par égalité manquerait des données). La fenêtre gonflée à 2 jours
absorbe donc tout le CA de "SFP-Toulouse" tombé le 15/02 — dont la propre fenêtre, elle, ne
déborde sur rien le 16/02 (aucune vente ce jour-là), d'où l'asymétrie observée (PFC faux, SFP
correct).

**La donnée précise pour corriger ça existe déjà en base** — `Event.eventEndTime` et
`Event.sessions` (`doorsOpening`/`showTime`) sont renseignés pour les 77 events de cet espace
(vérifié, 100%) :
```
PFC - RC Lens : doorsOpening 19:00, eventEndTime "03:00" (sur eventEndDate = 15/02)
SFP-Toulouse  : doorsOpening 19:00, eventEndTime "04:00" (sur eventEndDate = 16/02)
```
`resolveEventWindow` (`aggregation.service.ts`, Data Integration) utilise déjà exactement ces deux
champs via `combineDayAndLocalTime` pour calculer une fenêtre à l'heure près — `resolveEventSalesScope`
(Analyse) ne les lit jamais, et se rabat sur le jour calendaire seul.

### Pourquoi seulement "après chargement" (mécanisme frontend)

Deux sources de CA coexistent sur la page Analyse (`AnalyseView.vue:856-865`, `chartRecords`) :
1. **Rapide, correcte** : `Event.revenue` + RPC `get_space_shop_details` (jointure stricte par
   `weezeventEventId`, migration du 18/08 — filtre bien par égalité, innocentée).
2. **Plus lente, arrive en arrière-plan** : `useAnalyseItemRecords.js` → `getEventTimelineBatch`
   (la fonction bugguée ci-dessus). `chartRecords` bascule silencieusement sur cette 2ᵉ source dès
   qu'elle répond — d'où le chiffre correct puis faux.

## Correction retenue

Porter dans `resolveEventSalesScope` le même calcul que `resolveEventWindow` (mode heure-précise) :
```
doorsOpen  = combineDayAndLocalTime(eventDate,    sessions[0].doorsOpening, spaceTimezone)
doorsClose = combineDayAndLocalTime(eventEndDate, eventEndTime,             spaceTimezone)
```
avec les mêmes buffers (`DEFAULT_OFFSET_OPEN_MINUTES`/`DEFAULT_OFFSET_CLOSE_MINUTES`,
`event-window.util.ts`) au lieu du jour calendaire brut. Résultat pour ce cas : PFC - RC Lens
`[14/02 19h00, 15/02 03h00[`, SFP-Toulouse `[15/02 19h00, 16/02 04h00[` — aucun chevauchement.

`combineDayAndLocalTime`/`parseEventSessions` sont des fonctions JS **pures** (déjà dans
`event-window.util.ts`, aucune requête DB) : calculables pour tout le batch d'events d'un coup,
sans perte de la performance batch qui est la raison d'être de `resolveEventSalesScope`. Pas de
changement d'architecture — remplacer le calcul de `windowEnd`/`eventDate` actuel (lignes
1249-1271) par le même appel que côté Data Integration, avec repli sur le jour calendaire brut
uniquement si `doorsOpening`/`eventEndTime` sont absents (comme `resolveEventWindow` le fait déjà).

**Non retenu** : dérivation depuis les trous d'activité dans les transactions observées (l'idée
initiale, validée empiriquement — trou net de 19h entre les deux matchs — mais rendue inutile
puisque l'heure précise existe déjà en base, pas besoin de la redéduire).

## Risque de régression / à surveiller

- **Portée** : 13 events passés + 1 futur (SFP-Vannes, 2026-11-28) sur Stade Jean Bouin ont
  `eventEndDate = eventDate+1`, tous potentiellement affectés si un autre event a lieu le
  lendemain avec du CA. Seul PFC-RC Lens/SFP-Toulouse vérifié en détail à ce jour. Origine
  confirmée : les 14 sont créés en rafale (13 dans la même fenêtre de 30s le 2026-07-31, 1 le
  2026-08-04 — signature d'un import CSV ligne par ligne, `weezeventEventId` null sur les 14, ce
  qui exclut `bulkCreateEvents` comme origine).
- **`space-aggregation.service.ts::aggregateProductsByMinute`** (route `POST /dashboard/rebuild`)
  a la même famille de risque (mêmes tables, même logique de fenêtrage au jour) mais n'est
  actuellement appelée par aucun bouton du frontend (vérifié) — à corriger en même temps si
  jamais rebranché.
- Le fix touche `getEventTimelineBatch`/`getTransactionBasketsBatch`, déjà l'objet de 4 bugs
  récents (BUG-130/328/329/330-02) — revérifier après coup les tenants "1 event Weezevent = 1
  match" qui fonctionnent déjà correctement.
- Vérifier le cas où `sessions`/`eventEndTime` sont absents pour un event (repli sur le jour
  calendaire actuel, comme `resolveEventWindow` le fait déjà) — ne doit pas régresser les espaces
  dont les events n'ont pas cette précision.

## Références

- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) — fix de la
  veille sur `aggregation.service.ts`, même famille de fonction (fenêtrage transaction↔event),
  même espace/tenant.
- [BUG-130-01](130_01_shop_details_rpc_costmap_scan_transactions_index_manquant.md),
  BUG-328/329/330-02 — historique récent de bugs sur ces mêmes fonctions de fenêtrage.
