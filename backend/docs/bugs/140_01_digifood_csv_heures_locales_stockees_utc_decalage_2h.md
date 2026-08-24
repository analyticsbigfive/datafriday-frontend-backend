# BUG-140-01 — Timeline Analyse : +2 h sur les events importés par CSV Digifood — heure murale stockée comme UTC

- **Statut** : 🟡 Corrigé non testé (réimport CSV requis pour réparer l'existant)
- **Sévérité** : 🔴 Bloquant (toutes les heures de la timeline fausses sur ces events)
- **Domaine** : Intégrations & ventes / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend)
- **Découvert le** : 2026-08-24 (signalement JLH : « décalage de 2 h, il faut prendre
  strictement les heures de la source » — space La Beaujoire Nantes, Nantes-Rodez 22/08)
- **Fichiers** : `src/features/digifood/services/digifood-csv-import.service.ts`
  (`parseCsvDate`, `CSV_NAIVE_TIMEZONE`), `src/shared/utils/event-window.util.ts`
  (`utcOffsetMinutes`, réutilisé), `src/features/digifood/services/digifood-ingestion.service.ts:134-145`
  (écriture `transactionDate`, non modifié)

## En clair

Les fichiers CSV Digifood donnent l'heure de vente en heure locale du stade (« 11:58 »), sans
fuseau. L'import lisait cette heure telle quelle dans le fuseau du serveur : sur Render (réglé en
UTC), « 11:58 heure de Paris » était enregistré comme « 11:58 UTC ». À l'affichage, la page
Analyse reconvertit l'UTC vers l'heure de Paris — et ajoutait donc 2 h à une heure qui était déjà
locale : ventes de 11:58 affichées à 13:58. Le correctif déclare explicitement que ces heures
sans fuseau sont des heures de Paris, et les convertit une bonne fois en vrai UTC avant stockage.
Un réimport des CSV concernés remet l'historique d'aplomb (l'import met à jour la date des
commandes déjà présentes).

## Symptôme

Timeline Nantes-Rodez (22/08/2026, space La Beaujoire Nantes, 4 204 tx importées par CSV
Digifood) affichée 13:58 → 18:20 alors que la source donne 11:58 → 16:20 : +2 h sur tout.
Vérifié en base dev : `WeezeventTransaction.transactionDate` = 11:58:00 → 16:20:00 pour ces
intégrations, `rawData->'rows'->0->>'placed_at_time'` = « 11:58 » (heure murale) ; par contraste,
les intégrations API Weezevent du même jour ont `transactionDate` = `rawData->>'created'`
(suffixé `Z`, vrai UTC) au millième près.

## Cause racine

`parseCsvDate` terminait par `new Date("2026-08-22T11:58")` : un horodatage SANS fuseau est
interprété par Node dans le **fuseau du process**. Sur un serveur en UTC (Render), l'heure murale
Paris est absorbée telle quelle comme UTC → `transactionDate` stocké avec 2 h d'avance sur le
vrai instant (1 h en hiver). La lecture (`spaces.service.ts`, conversion
`AT TIME ZONE 'UTC' AT TIME ZONE Space.timezone`, BUG-270/BUG-125-01) reconvertit alors une
valeur déjà locale → +2 h affichées. Sur un poste dev en Europe/Paris, le même import est correct
— symptôme dépendant de l'environnement, d'où le diagnostic difficile.

Convention DB violée : `transactionDate` doit contenir du vrai UTC
(RUNBOOK_2026-08-24_ANALYSE_TRANSACTIONS.md, vérifié pour la voie API Weezevent — la voie CSV
Digifood était la seule à l'enfreindre).

## Correction

2026-08-24, branche `fix/event-predict-deeplink-event-passe` :

- `parseCsvDate` : un horodatage porteur d'un fuseau explicite (`Z`, `±hh:mm`) reste parsé
  directement (instant absolu). Un horodatage NAÏF est désormais interprété comme heure murale
  `CSV_NAIVE_TIMEZONE = 'Europe/Paris'` et converti en vrai instant UTC via `utcOffsetMinutes`
  (`event-window.util`, mécanique deux passes identique à `combineDayAndLocalTime` — heure
  été/hiver gérée), **indépendamment du fuseau du process**.
- Réparation de l'existant : **réimporter les CSV concernés** — `ingestOrder` fait un upsert dont
  la branche `update` réécrit `transactionDate` (`digifood-ingestion.service.ts:145`), puis
  re-agréger (`POST /aggregation/process-events`). Aucune migration SQL.

## Risque de régression / à surveiller

- Un CSV dont les heures seraient DÉJÀ en UTC serait décalé de -2 h par ce correctif : les
  exports Digifood observés (placed_at_date/placed_at_time) sont en heure murale, mais vérifier
  la période affichée dans l'aperçu (dry-run, `periodStart`/`periodEnd`) au premier réimport.
- `CSV_NAIVE_TIMEZONE` est une constante : si un site hors Europe/Paris arrive un jour, la
  dériver du `Space.timezone` de l'intégration.
- Contrôle post-réimport : première/dernière vente de Nantes-Rodez affichées 11:58 / 16:20
  (heures source strictes), `transactionDate` en base = 09:58 / 14:20 UTC.

— JLH
