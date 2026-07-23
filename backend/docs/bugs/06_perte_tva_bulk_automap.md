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

`MenuItemsService.bulkCreate()` reste par ailleurs sans dédoublonnage par nom aujourd'hui (cf.
BUG-052) — de nouveaux doublons orphelins peuvent continuer à s'accumuler à chaque nouveau mapping
en masse tant que ce chemin n'est pas corrigé.

## Références

- `08_tva_defaut_20_incorrecte.md`
- `07_prix_fnb_weezevent_absent.md`
- [BUG-052](52_quickcreate_sans_dedoublonnage_par_nom.md) — même famille de défaut
  (`bulkCreate()` sans dédoublonnage par nom), non corrigée sur ce chemin précis.
