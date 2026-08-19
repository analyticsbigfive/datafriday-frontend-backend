# BUG-131-01 — `GET /ingredients` : le select du MarketPrice niché omet `purchaseUnitConversion`

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Ingredients (consommé par Réarmement / liste de courses côté front)
- **Repo(s) concerné(s)** : les deux (fix ici, symptôme côté `datafriday-web` — fiche miroir
  frontend BUG-342-01)
- **Découvert le** : 2026-08-19 (réunion Bertrand — viande tranchée « 405 packs de 1 kg »)
- **Fichiers** : `src/features/ingredients/ingredients.service.ts:29` (`marketPriceSelectNoImage`)

## Symptôme

Liste de courses front : un article en pièces dont le Market Price porte une conversion d'unité
d'achat (viande tranchée, 0,02 kg/pièce, pack de 1 kg) affichait « 405 packs de 1 kg » pour 405
pièces au lieu de `ceil(405 × 0,02) = 9`. Même chiffre dans l'email fournisseur.

## Cause racine

Le select `marketPriceSelectNoImage` (utilisé par `findAll` et `create` pour le MarketPrice niché
des ingrédients) énumère `packedUnits`, `numberOfUnits`, `unitsPerPurchase`… mais **pas
`purchaseUnitConversion`**. Côté front, `computePackagingForQuantity` (`stockPlanning.js`) lit
`toNumber(src.purchaseUnitConversion, 0) || toNumber(mp?.purchaseUnitConversion, 1) || 1` : champ
absent → conversion 1 → le nombre de pièces devient un nombre de packs. Les chemins qui renvoient
le MarketPrice complet (drawer Market Price) n'étaient pas touchés — d'où les articles « bons » et
« pas bons » selon le chemin de résolution.

## Correction

Branche `fix/inventaire-attendus-packs-rearmement` (2026-08-19) : `purchaseUnitConversion: true`
ajouté au select. Cache Redis de la liste : TTL 60 s, aucune invalidation à écrire.

## Risque de régression / à surveiller

Aucun consommateur ne peut casser (champ ajouté, pas retiré). Après déploiement, toutes les lignes
ingrédient à conversion ≠ 1 changent de quantité affichée dans la liste de courses — c'est la
correction attendue. Vérifier la viande tranchée : 405 pièces → 9 packs de 1 kg.

NB : le bug de SAISIE de la conversion (0,015 ↔ 0,02 vu en réunion) est distinct et hors de cette
fiche — champ `NumberField` à 2 décimales dans le drawer Market Price front.

## Références

- Fiche miroir frontend : `datafriday-web` BUG-342-01.
- Réunion : https://fathom.video/share/32quEeoVBR3gAqzW8h9sJNiRSvHvareW

JLH
