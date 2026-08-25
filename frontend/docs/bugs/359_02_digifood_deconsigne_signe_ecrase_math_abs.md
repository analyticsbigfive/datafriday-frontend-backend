# BUG-359-02 — Import CSV Digifood : `Math.abs()` écrase le signe négatif des lignes déconsigne/avoirs, CA compté en double

- **Statut** : 🟢 Corrigé (code) — **backfill des données déjà importées non fait** (voir Correction)
- **Sévérité** : 🔴 Bloquant/impact business (CA gonflé sur toutes les intégrations Digifood-CSV
  avec système de consigne)
- **Domaine** : Intégrations & ventes (import Digifood)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-24 — question de KOUAME Ulrich en cours d'investigation d'un autre bug
  (step 4 vide, BUG-358-02) : "il y a pas des deconsigne ? des chiffres a moins (-)"
- **Fichiers** : `backend/src/features/digifood/services/digifood-csv-import.service.ts:551-580`
  (`buildNormalizedOrder`)
- **Commit** : `78404db8` "Fix sign handling for refunds and negative amounts in Digifood CSV
  import" (2026-08-24 19:23 UTC)

## Symptôme

Sur l'event "Nantes-Rodez" (tenant `cmrpf3ukw0001bdu2h6rz0vbz`), l'article "DECONSGINE A 1€"
(remboursement de la consigne gobelet au client) apparaît en base avec `quantity` et `unitPrice`
**positifs** (1443 lignes, +3952 € de CA), au lieu de négatifs — comptant chaque gobelet rendu comme
une vente supplémentaire au lieu d'annuler la consigne payée à l'achat.

## Cause racine

Le CSV Digifood encode pourtant correctement le remboursement en négatif dans `rawData` brut :
```json
{ "item_name": "DECONSGINE A 1€", "quantity": "5", "total_ttc": "-5.00 €", "type": "pos" }
```
Mais `buildNormalizedOrder` (`digifood-csv-import.service.ts:557-568`) ne déduisait le signe
QUE du champ `type` de l'order entier (`/refund|rembours/i`) — qui ne matche jamais `"pos"` — puis
appliquait `Math.abs()` sur `total_ttc` pour calculer `unitPrice`, écrasant le signe négatif source
:
```js
const isRefund = entries.some((e) => /refund|rembours/i.test(e.row.type));
const sign = isRefund ? -1 : 1;                                    // "pos" → sign = 1
const unitPrice = ... Math.abs(parseAmount(row.total_ttc)) / qtyAbs; // écrase le "-"
```

**Ampleur mesurée** (lecture seule, avant fix) : 1413 transactions sur 4204 (33%) pour ce seul event
ont un `total_ttc` négatif dans le CSV source, toutes des lignes "DECONSGINE A 1€", `type: "pos"`.
Impact source : -3889,50 € comptés en +3889,50 € → CA gonflé d'environ 2× ce montant (~7779 €) rien
que sur cet event. Vérifié isolé au seul tenant `cmrpf3ukw0001bdu2h6rz0vbz` (aucun autre tenant
affecté par ce pattern précis à la date du fix).

## Correction

Le signe de chaque LIGNE suit désormais son propre montant source (`price_pu` sinon `total_ttc`),
en plus du flag `type` au niveau de l'order (OU logique, jamais de double négation puisque
`qtyAbs`/`unitPrice` repartent toujours de `Math.abs()`, une seule négation appliquée ensuite) :
```js
const rowIsNegative = hasPricePu ? parseAmount(row.price_pu) < 0 : hasTotalTtc && parseAmount(row.total_ttc) < 0;
const sign = isRefund || rowIsNegative ? -1 : 1;
```

**Backfill des données déjà importées** : fait par **réimport du fichier CSV d'origine** plutôt
qu'un script de correction séparé — `digifood-ingestion.service.ts:118-161` (`ingestOrder`) fait un
`upsert` sur la transaction (par `order_id`, idempotent) et un `deleteMany` + `createMany` complet
sur les lignes à chaque ré-ingestion, donc réimporter le même fichier avec le code corrigé écrase
intégralement les anciennes lignes mal signées. Confirmé fait par l'utilisateur ("Bien, okay fixé en
rimportant").

## Risque de régression / à surveiller

- Vérifier qu'aucun AUTRE tenant Digifood-CSV n'a un pattern de lignes négatives `type` ≠
  refund/rembours non couvert (mesuré uniquement sur `cmrpf3ukw0001bdu2h6rz0vbz` au moment du fix —
  à revérifier après import sur d'autres tenants).
- Le fix ne couvre que `digifood-csv-import.service.ts` (import CSV) — le chemin webhook temps réel
  (`digifood-order-normalizer.ts`) n'a pas été audité pour le même pattern (signe déjà correct côté
  payload webhook Digifood a priori, non vérifié empiriquement).
- Aucun test unitaire ajouté pour ce cas précis (ligne négative `type: "pos"`) — à vérifier dans
  `digifood-csv-import.service.spec.ts`.

## Références

- [BUG-358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md) — bug distinct découvert
  dans la même investigation (step 4 vide pour Nantes-Rodez).
