# Réponses aux questions ouvertes — 2026-07-27

Compagnon de [`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md), suite de
[`REPONSES_QUESTIONS_2026-07-24.md`](REPONSES_QUESTIONS_2026-07-24.md). Deux sources :

1. **Réponses métier** tranchées le 2026-07-27 par l'owner (JLH) — questions **#31** et **#33**.
2. **Mesures base de données** du 2026-07-27 (lecture seule, base Supabase `alsgdtewqeldrrquypdy`
   pointée par `frontend/.env` — celle servie par `datafriday-api.onrender.com`), utilisées pour
   cadrer les deux questions avant de les poser.

Comme le 2026-07-24 : une réponse validée ici n'est pas un fix livré. Chaque ligne marquée ⚠️ a sa
doc canonique à jour mais **le code reste à modifier**.

---

## 1. Réponses métier (tranchées le 2026-07-27)

| # | Question (résumé) | Réponse |
|---|---|---|
| 31 | Pre-event — ventes hors match dans la fenêtre post→pre : déduire la consommation dérivée des ventes, ou assumer « mouvements seuls » ? | **« Mouvements seuls ».** On ne vend **pas** hors match sur l'espace, et de toute façon une vente hors match (privatisation, kiosque) **ne sort pas du stock inventorié** — deux « non ». L'attendu pre-event reste donc `post-event précédent + livraisons/transferts Logistic`, sans déduction de ventes. La déduction serait non seulement inutile mais **fausse** au regard du second « non ». |
| 33 | Inventaire — lignes `InventoryCount` avec `shopId=NULL` : quelle sémantique métier (comptage « niveau espace » ?) ? | **Aucune — il n'existe pas de comptage niveau-espace.** Tout stock compté est soit dans un **point de vente**, soit dans une **réserve** (« storage et pdv uniquement »). Or les deux sont des `SpaceElement` avec leur propre id, donc adressables par `shopId` tel quel. Conséquence : `shopId` devient **obligatoire** (DTO + `NOT NULL`), pas de clé sentinelle, pas d'adaptation front. |

---

## 2. Mesures ayant servi à cadrer les questions (2026-07-27)

### 2.1 Question #31 — le cas existait bien, mais il est structurel

| Mesure | Valeur |
|---|---|
| Snapshots `InventorySnapshot` `kind='post-event'` en base | **1** — espace `cmovsjbiz…`, event « Auxerre Ipswitch », créé le 2026-07-24 10:04 |
| `StockMovement` sur cet espace depuis ce snapshot | **0** |
| Transactions valides mappées sur les 25 `SpaceElement` de l'espace depuis ce snapshot | **290** (2026-07-25, 14:56 → 17:58), **non simulées** (`metadata.isSimulated` absent) |
| Consommation dérivée calculable — requête de `deriveSalesRaw` rejouée à l'identique avec `since` = date du snapshot | **661 unités**, 13 couples (élément × menu item), 1 élément |
| `Event` existant le 2026-07-25 pour ce tenant | **aucun** (prochains : 2026-07-30, 2026-07-31) |

Lecture : `computeExpected` n'ayant aucun mouvement à rejouer, l'attendu du match suivant vaut
exactement le comptage post-event, alors que 661 unités de consommation étaient **calculables** et
absentes. Le constat est donc **structurel** (comportement du code), pas une preuve terrain : ce
cycle est un état de QA — son snapshot post-event est rattaché à un event **futur** (2026-07-30) et
l'autre event a un `eventEndDate` (2026-07-16) antérieur à son `eventStartDate` (2026-07-31).

⚠️ **Conséquence de la réponse « on ne vend pas hors match » — origine identifiée, ce n'est PAS un
mapping fautif.** Détail des 290 transactions : élément **PARVIS** (`type='shop'`), location Weezevent
**PARVIS** — rattachement correct. Elles portent l'`eventName` **« AJ AUXERRE - Saison 26/27 »**,
c'est-à-dire un event Weezevent **de saison**, pas un match. Autrement dit : ce sont très
probablement de vraies ventes de jour de match, pour un match **absent du calendrier `Event` de
DataFriday** (aucune ligne `Event` au 2026-07-25 pour ce tenant). Le côté « hors match » est un
artefact du **calendrier incomplet / du rapprochement `Event` ↔ `WeezeventEvent`**, pas d'un PDV mal
rattaché. À noter : le rapprochement automatique documenté dans `schema.prisma` (renseigner
`weezeventEventId` quand exactement 1 `Event` et 1 `WeezeventEvent` partagent tenant + date
calendaire) **ne peut pas fonctionner** contre un event Weezevent de saison.

Suivi retenu : garder un **garde-fou non bloquant** — log serveur quand des ventes existent dans la
fenêtre de calcul de l'attendu. Ça ne change pas l'attendu, mais révèle le cas « ne devrait pas
arriver » (ici : un match non enregistré) au lieu de l'avaler en silence. **Non implémenté.**

Rappel de dépendance : #31 ne ferme pas #24/#25 (ancrage sur l'event, reset « Door opening »), qui
restent à trancher/implémenter séparément et qui **déplaceront le point de départ** du calcul.

### 2.2 Question #33 — les données tranchaient déjà, la réponse métier confirme

| Mesure | Valeur |
|---|---|
| Lignes `InventoryCount` en base | **152** |
| Dont `shopId IS NULL` | **0** |
| Espaces concernés | 1 · dernière écriture 2026-07-24 16:31 |
| Index unique `uniq_inventory_count` en `NULLS NOT DISTINCT` | **oui, vérifié en base** (`pg_index.indnullsnotdistinct = true`) |

Trois constats qui ont réduit la question à « fermer ou spécifier » :

1. **Une réserve est déjà adressable** : `storage` est une valeur de l'enum `ElementType`
   (`schema.prisma`), donc une réserve est un `SpaceElement` avec son propre id. Vérifié côté écran :
   l'onglet « storage » compte bien avec l'id de l'élément
   ([`SpaceInventoryView.vue:479`](../src/views/SpaceInventoryView.vue) —
   `focus-storage-id="countingShop.element.id"`). Et `storageLocation` n'est qu'un champ texte libre
   **à l'intérieur** d'une ligne de PDV.
2. **La branche NULL est atteignable aujourd'hui**, pas seulement legacy : `shopId?: string` dans
   `create-inventory-count.dto.ts` — tout appelant qui omet le champ écrit une ligne acceptée en
   écriture et invisible en lecture (skip de `buildInventoryCounts`).
3. **Ces lignes se comportaient déjà comme un comptage niveau-espace, par accident** : avec
   `NULLS NOT DISTINCT`, elles se collapsent en une seule ligne par (space, event, item) — sémantique
   jamais spécifiée ni affichée.

⚠️ **Reste à faire (code)**, dans cet ordre :

1. **Re-mesurer sur la base de production** le nombre de lignes `shopId IS NULL` (0 en staging) ;
   nettoyer d'abord si ≠ 0.
2. **DTO** `create-inventory-count.dto.ts` : `@ApiProperty` + `@IsString()` + `@IsNotEmpty()`,
   retrait de `@IsOptional()`, `shopId: string` → un appel sans point de vente reçoit un **400
   explicite** au lieu d'écrire dans le vide.
3. **Base** : `shopId String` dans `schema.prisma` + migration `NOT NULL` dans `prisma/sql/`
   (convention du projet, cf. [ADR-0002 backend](../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md)).
   `uniq_inventory_count` reste tel quel, il devient simplement sans effet de bord.
4. Le `skip` de `buildInventoryCounts` reste en place comme filet pour d'éventuelles lignes legacy,
   avec un commentaire indiquant qu'il est désormais inatteignable par l'API. La spec
   « falls back to the snapshot when ALL counts have null shopId » est conservée comme garde de
   non-régression.

### 2.3 Note de méthode — BUG-94

La fiche [BUG-94](../../backend/docs/bugs/94_buildinventorycounts_perd_lignes_shopid_null.md) décrit
« un espace dont les `InventoryCount` ont tous `shopId=null` » : ce cas **n'est pas observable dans
cette base** (0 ligne sur 152). Même précaution que pour la fiche 181 — vérifier quel environnement
la fiche mesurait avant de tirer une conclusion de son énoncé. Le fix de repli sur snapshot reste
valide et utile ; c'est seulement la sémantique qui est désormais tranchée.

---

*JLH*
