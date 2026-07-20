# BUG-208 — Le correctif du badge étage (BUG-003) régresse pour les tenants à plusieurs configurations

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur (régression du comportement corrigé par BUG-003, dans une condition
  plus étroite)
- **Domaine** : Intégrations & ventes (wizard, étape 2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapShops.vue:1160-1236` (`loadData`)

## Symptôme

`loadData()` reconstruit `floorMap` en deux passes. La première (1160-1186, `levelByShop` construit
depuis `rawShops[].floorLevel`) couvre tout le space, indépendamment de la configuration. La
seconde (1189-1236) **remplace entièrement** `this.floorMap`/`floorNameMap` (`this.floorMap =
newFloorMap`, pas une fusion) en utilisant `getSpaceFloorOptions(spaceId, userConfigs[0]?.id ||
null)` — restreint à une **seule** configuration (`userConfigs[0]`, la première configuration
utilisateur seulement ; le commentaire de l'API dit lui-même "de la config principale"). Si un
tenant a plus d'une configuration utilisateur (l'UI le supporte clairement —
`floorDialogConfigOptions`/`quickCreateConfigOptions` itèrent sur *toutes* les configs), toute
location mappée vers un shop qui vit dans une **deuxième** configuration ou plus ne sera pas
trouvée dans `elementFloorIndex` — son entrée disparaît silencieusement de `newFloorMap`, et le
badge d'étage — correctement présent dans la première passe — **disparaît après un rechargement**.
C'est exactement le symptôme décrit par BUG-003 ("le badge d'étage se réinitialise de façon
inattendue"), réintroduit dans une condition plus étroite que le bug d'origine.

## Cause racine

La reconstruction "faisant autorité" (2ème passe) est scopée à une seule config, alors que la
reconstruction précédente (1ère passe, toujours présente) est space-wide ; les deux ne sont jamais
fusionnées, seulement écrasées.

## Correction

Dans `loadData`, la 2ème passe (scopée à `userConfigs[0]`) part maintenant de `{ ...this.floorMap }`
/ `{ ...this.floorNameMap }` (résultat de la 1ère passe, space-wide) au lieu de deux objets vides,
puis n'écrase que les entrées trouvées dans `elementFloorIndex`. Les locations dont le shop
appartient à une config utilisateur autre que `userConfigs[0]` conservent donc désormais le niveau
posé par la 1ère passe au lieu de le perdre.

## Risque de régression / à surveiller

Tester spécifiquement avec un tenant ayant ≥2 configurations utilisateur, chacune avec des shops
mappés à des locations différentes.

## Références

- `docs/bugs/03_badge_etage_reset_stepmapshops.md` (bug d'origine, corrigé).
