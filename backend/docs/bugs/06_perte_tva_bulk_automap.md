# BUG-006 — Perte de TVA lors du bulk auto-map

- **Statut** : 🟡 Corrigé partiellement (TVA fixée + backfill + nettoyage des 800 doublons
  strictement orphelins fait le 2026-07-21) — résidu ambigu de 156 lignes (55 groupes) nécessitant
  une décision produit, voir Risque de régression
- **Sévérité** : 🟠 Majeur (TVA)
- **Domaine** : Intégrations & ventes / Menu & recettes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-30
- **Nettoyage doublons le** : 2026-07-21

## Symptôme

Après un `bulkCreateAndMap`, le `vatRate` du menu item créé restait vide/0.

## Cause racine

`bulkCreateAndMap` n'envoyait pas `vatRate` à la création du menu item. `MenuItemsService.bulkCreate()`
n'a par ailleurs jamais eu de dédoublonnage par nom (même famille de défaut que BUG-052, non
corrigée sur ce chemin précis — voir sa section "Risque de régression") : chaque essai/retry de
mapping en masse recrée un nouveau `MenuItem` au lieu de réutiliser l'existant, d'où les doublons
accumulés pendant la période du bug.

## Correction

Fix `vatRate` appliqué + backfill des 1408 items affectés (2026-06-30).

**Nettoyage des doublons orphelins (2026-07-21)**, sur demande explicite après diagnostic en
lecture seule :
- 641 groupes de doublons (nom identique, insensible à la casse, même tenant) recensés, 1516 lignes
  `MenuItem` actives impliquées au total.
- Vérifié sur toute la chaîne de référence (`WeezeventProductMapping`, `SpaceMenuItem`,
  `MenuAssignment`, `MenuItemComponent`/`Ingredient`/`Packaging`, `ElementInventory`,
  `StockMovement`) : **800 lignes strictement orphelines** (zéro référence nulle part), toutes sur
  un seul tenant (Big Five, `cmovqyk50033h13qq070wvws0` — tenant réel actif, 353k transactions
  Weezevent, pas un compte de test), toutes créées entre le 14 et le 21 mai 2026 (une seule
  fenêtre d'une semaine — cohérent avec des essais répétés de mapping en masse sur cette période).
  Exemples : "chips" (15 copies), "chocolat" (15), "lays nature" (8), "cookie" (7)...
- Ces 800 lignes ont été **supprimées** (`DELETE` transactionnel, vérifié avant/après : 800
  attendues = 800 supprimées, aucun autre tenant touché, total `MenuItem` actif cohérent
  post-suppression). Effet de bord positif : sur les 716 doublons restants qui avaient un
  `WeezeventProductMapping` actif, 560 étaient en fait le seul survivant réel de leur groupe (les
  autres copies du même nom n'étaient que les orphelins supprimés) — ils ne sont donc plus comptés
  comme "doublons ambigus" du tout après nettoyage.

## Risque de régression / à surveiller

**Résidu volontairement non touché** : 55 groupes de noms (156 lignes) où **plusieurs** `MenuItem`
du même nom ont chacun leur propre `WeezeventProductMapping` actif. Impossible de trancher
automatiquement sans risque :
- soit ce sont de vrais doublons (même produit Weezevent re-mappé après un bug de dédup) —
  fusionnables sans perte,
- soit ce sont des produits Weezevent **distincts** qui partagent juste le même nom d'affichage
  (ex. un article vendu sous plusieurs SKU Weezevent différents selon le point de vente) — les
  fusionner casserait le suivi de vente distinct par SKU.

Une fusion automatique heuristique (par nom) risquerait donc une association silencieuse
incorrecte — même famille de prudence que BUG-021. À traiter dans un chantier séparé nécessitant
soit une décision produit (fusionner quand même, au cas par cas), soit une inspection manuelle des
55 groupes restants (volume largement réduit par rapport aux 716 initiaux).

~~`MenuItemsService.bulkCreate()` reste par ailleurs sans dédoublonnage par nom aujourd'hui (cf.
BUG-052) — de nouveaux doublons orphelins peuvent continuer à s'accumuler à chaque nouveau mapping
en masse tant que ce chemin n'est pas corrigé.~~ **Corrigé le 2026-07-24** — voir "Correction
appliquée (partie dédup forward)" plus bas : `bulkCreate()` ne peut plus créer de nouveau doublon
par nom pour un même tenant. Ce paragraphe ne concerne donc plus que les 156 lignes déjà
existantes avant cette date (résidu ci-dessus, décision produit toujours nécessaire).

## Correction appliquée (partie dédup forward)

Appliquée le 2026-07-24, scope strictement limité au dédoublonnage *forward* (empêcher de
**nouveaux** doublons lors des prochains imports) — ne touche ni au fix TVA (déjà fait), ni au
nettoyage des 156 lignes historiques ambiguës (toujours hors scope, décision produit requise, voir
section précédente) :

- `MenuItemsService.bulkCreate()` (`menu-items.service.ts:396`) applique désormais le même garde-fou
  que `create()::dedupeByName` (BUG-052, `menu-items.service.ts:271`) : avant insertion, recherche
  des `MenuItem` déjà actifs du tenant (`deletedAt: null`) dont le nom correspond (trim + insensible
  à la casse, `mode: 'insensitive'`, même pattern que `assertProductTypeNameAvailable`/
  `assertProductCategoryNameAvailable`). Une ligne du payload dont le nom matche un item existant
  n'est **plus insérée** : l'item existant est réutilisé à sa place. Le même contrôle s'applique aux
  doublons *internes* au payload lui-même (deux lignes du même import portant le même nom) — seule
  la première est insérée, les suivantes réutilisent son id.
- Contrat de réponse étendu de façon non-breaking : `items` reste un tableau **positionnel** de même
  longueur et même ordre que le payload d'entrée (un appelant qui apparie la réponse par index, comme
  `StepMapMenuItems.vue::bulkCreateMapAndApplyPrices` côté frontend, n'est pas cassé) ; chaque entrée
  réutilisée porte `duplicate: true`. `count` ne compte que les insertions réelles. Deux nouveaux
  champs : `duplicatesCount` et `duplicates` (`{ index, name, reusedItemId, reason }`, `reason` valant
  `existing_tenant_item` ou `duplicate_in_batch`) pour que l'appelant sache combien de lignes ont été
  sautées et pourquoi, plutôt qu'un silent-drop.
- Tests unitaires ajoutés : `backend/src/features/menu-items/menu-items.bulk-create.spec.ts` — doublon
  intra-tenant sauté (pas ré-inséré), même nom dans un **autre** tenant non considéré comme doublon
  (scope tenant vérifié), matching insensible à la casse (+ trim), doublon interne au payload, cas
  nominal sans doublon. `npx jest src/features/menu-items/menu-items.bulk-create.spec.ts` : 5/5 ✅.

**Reste explicitement hors scope de cette correction** : le nettoyage des 55 groupes / 156 lignes
déjà dupliquées avant ce fix (décision produit nécessaire, voir section précédente) — ce fix
empêche seulement l'accumulation de *nouveaux* doublons à partir du 2026-07-24.

## Références

- `08_tva_defaut_20_incorrecte.md`
- `07_prix_fnb_weezevent_absent.md`
- [BUG-052](52_quickcreate_sans_dedoublonnage_par_nom.md) — même famille de défaut
  (`bulkCreate()` sans dédoublonnage par nom) ; le chemin `bulkCreate()` est maintenant corrigé
  ici pour la partie forward (voir "Correction appliquée (partie dédup forward)" ci-dessus).
