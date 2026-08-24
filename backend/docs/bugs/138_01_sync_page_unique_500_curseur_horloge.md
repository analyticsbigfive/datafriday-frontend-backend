# BUG-138-01 — Sync Weezevent : une seule page de 500 par passe + curseur horloge murale → transactions perdues définitivement lors des pics

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🔴 Bloquant/impact business (perte de données de vente, silencieuse et définitive)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/features/weezevent/services/weezevent-client.service.ts:79-88`, `src/features/weezevent/services/weezevent-cron.service.ts:72`, `src/features/weezevent/services/weezevent-incremental-sync.service.ts:260-261,347`

## Symptôme

Le Mans-Brest (22/08/2026) : **81 transactions / 212 lignes / 891,67 € HT jamais importées**,
en deux blocs d'IDs Weezevent parfaitement contigus (7148-7162 et 7663-7728), tous pendant
le pic de la mi-temps (~1 437 transactions entre 21:30 et 22:00, ~55 tx/min). Découvert en
comparant l'export CSV Weezevent (5 802 transactions, 66 459 € HT) à la base (5 721,
65 560 €). **La full sync hebdomadaire du dimanche 02:00 n'a rien rattrapé** : mesuré le
23/08 à 02:00, elle a importé exactement 500 transactions puis s'est arrêtée — les 81
manquaient toujours le 24/08.

Se reproduira à chaque pic de débit (mi-temps, fin de match, concert) dépassant
500 transactions par passe de 10 minutes.

## Cause racine

Trois défauts qui se composent — chacun vérifié dans le code et confirmé **à la seconde
près** par les timestamps en base :

**1. Une seule page par passe.** L'API Weezevent renvoie parfois un **tableau brut** ; la
normalisation (`weezevent-client.service.ts:79-88`) force alors `total_pages: 1` →
`hasMore = response.meta.current_page < response.meta.total_pages` devient `false` après la
**première page**, quelle que soit la donnée restante. La boucle
`while (hasMore && totalProcessed < maxItems)` ne tourne qu'une fois — les `maxItems`
généreux (5 000 en incrémental, 50 000 en hebdo) sont inopérants.

**2. `batchSize: 500` demandé au cron** (`weezevent-cron.service.ts:72,198,367,373`), alors
que le service documente lui-même « Weezevent API per_page max is 100 »
(`weezevent-incremental-sync.service.ts:47`). Résultat observé : une page unique de
500 éléments par passe — le « plafond » mesuré **trois fois**, et **jamais dépassé sur
toute l'histoire de l'intégration** :

```sql
-- max = 500 exactement, 0 passe au-dessus, sur 32 passes : la pagination ne s'enclenche jamais
SELECT MAX(cnt), COUNT(*) FILTER (WHERE cnt = 500) FROM (
  SELECT date_trunc('minute',"createdAt"), COUNT(*) cnt FROM "WeezeventTransaction"
  WHERE "integrationId" = 'cmt01vzza007dqw011q4js95x' GROUP BY 1) x;
```

| Passe (`createdAt`) | Importé | Fenêtre `transactionDate` couverte |
|---|---|---|
| 19/08 12:20 — **premier sync**, sans borne de date | 500 | 07/02 11:24 → 07/02 14:03 |
| 22/08 20:00 — pic mi-temps | 500 | 22/08 19:45:10 → 19:54:05 |
| 23/08 02:00 — full sync hebdo | 500 | 15/08 13:14 → 15/08 15:17 |

La 1re ligne montre que ce n'est pas un défaut de pic : le sync **initial**, sans borne de
date, s'est lui aussi arrêté à 500 — sur 2 h 40 de février. Le plafond est dur et s'applique
à **tous** les imports de cette intégration (6 721 lignes en base au total, dont 5 721 pour
la seule soirée du 22/08). Combien manque-t-il côté Weezevent sur l'historique complet n'a
pas été mesuré — à instruire après le fix de pagination.

**3. Curseur = horloge murale, pas données importées.**
`lastSyncedAt: new Date()` (`:347`) est posé à la fin du run même si tout n'a pas été pris,
et la fenêtre suivante démarre à `lastSyncedAt − 5 min` (`:260-261`). Tout ce qui n'a pas
été importé (au-delà de la page unique, ou devenu visible côté Weezevent avec plus de
5 minutes de retard — terminaux hors-ligne : jusqu'à **18 minutes** mesurées ce soir-là)
sort de la fenêtre et n'est **plus jamais retenté**.

Déroulé reconstitué (heure locale, `createdAt` en base) :

| Passe | Fenêtre (≥) | Importé | Perdu |
|---|---|---|---|
| 21:50:08 | 21:35:07 | 6863→7147 (285) | — (7148-7162 pas encore visibles côté API) |
| 22:00:09 | **21:45:08** | 7163→7662 (**500**, page unique) | 7148-7162 hors fenêtre (ventes ≤ 21:45:08, à 2 s près) ; 7663-7728 restés sur la « page 2 » jamais lue |
| 22:10:07 | **21:55:09** | 7729→8026 (298) | 7663-7728 désormais hors fenêtre (ventes ≤ 21:55:08, à 3 s près) |

## Correction

À faire (ordre de priorité) :

1. **Pagination fiable** : quand la réponse est un tableau, boucler tant que
   `data.length === perPage` au lieu de se fier à `total_pages` ; et ramener
   `batchSize` à ≤ 100 (max API documenté).
2. **Curseur par données, pas par horloge** : avancer `lastSyncedAt` au
   `MAX(created_at)` des transactions réellement importées (jamais `new Date()` quand la
   passe a laissé du reliquat), ou mieux : reprise par **ID** (les IDs Weezevent sont
   croissants et contigus — un trou d'IDs est détectable et re-fetchable).
3. **Chevauchement élargi** : 5 minutes est insuffisant pour les terminaux hors-ligne
   (18 min mesurées). 30 minutes coûte peu : la dédup par `existingIds` filtre déjà les
   transactions déjà présentes avant upsert.
4. **Garde-fou** : après chaque passe, vérifier la contiguïté des `weezeventId` importés ;
   un trou → alerte + re-fetch fenêtre élargie. C'est ce contrôle qui aurait transformé
   une perte silencieuse de 892 € en incident visible.

Rattrapage des 81 transactions du 22/08 : voir
`docs/RUNBOOK_2026-08-24_ANALYSE_TRANSACTIONS.md` §2 — avec des fenêtres **étroites**
(< 500 transactions chacune), sinon le présent bug plafonne aussi la resync manuelle.

⚠ Les commandes de rattrapage initialement écrites au runbook **ne pouvaient pas aboutir**,
pour une raison **distincte** : [BUG-139-01](139_01_resync_manuelle_fromdate_ignore.md) — en
mode incrémental, le `fromDate` passé à `POST /weezevent/sync` est ignoré, et le bouton
« Re-synchroniser » du front n'envoie aucune borne de date. Ajouter `"full": true` au curl
(runbook §2 corrigé) ; le bouton, lui, ne rattrapera jamais une date passée.

## Risque de régression / à surveiller

- La full sync hebdo est **le même code** : tant que 1) n'est pas corrigé, le filet de
  sécurité n'existe pas (500 transactions max par dimanche).
- Après correction, re-vérifier les autres soirs de match : la requête de contiguïté des
  IDs (runbook §2) se généralise à toute intégration.
- Le webhook (`webhook-event.handler.ts`) est un canal parallèle qui peut masquer le
  problème sur certains tenants — ne pas conclure « pas d'impact » sans vérifier la
  contiguïté des IDs.

## Références

- Découvert en instruisant l'écart CA de [BUG-135-01](135_01_transactions_count_compte_des_lignes.md)
  (export 66 459 € vs base 65 560 €) — l'écart de comptage et l'écart d'import sont deux
  problèmes distincts ; celui-ci est l'écart d'import.
- `docs/RUNBOOK_2026-08-24_ANALYSE_TRANSACTIONS.md` — rattrapage opérationnel.
- BUG-027 (garde anti-double-run du cron), BUG-337-02 (refresh SalesPriceAgg) — même zone.

---

*JLH*
