# BUG-053 — Component : "is stored in" (packaging) et quantité par carton jamais restaurés en édition (le fix BUG-035 était partiel)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (perte de données silencieuse à chaque édition)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue:763-816` (`loadComponentData`), `:446-473` (`data()`)

## Symptôme

[BUG-035](35_component_inventorypackaging_packedunits_jamais_envoyes.md) a été corrigé le jour même en
ajoutant `inventoryPackaging`/`packedUnits` aux payloads `onCreate`/`onUpdate`. Mais le correctif ne
touchait que l'envoi : en ouvrant `/components/edit/:id` d'un composant qui a déjà un packaging/quantité
renseigné, les deux champs s'affichaient vides. Si l'utilisateur sauvegardait sans y toucher (même pour
modifier un tout autre champ), la valeur déjà en base était silencieusement écrasée
(`inventoryPackaging` → `undefined`, `packedUnits` → `0`).

## Cause racine

`loadComponentData()` pré-remplissait `form.name`, `form.category`, `form.type`, `form.unit`,
`form.numberOfUnitsRecipe`, `form.storageType`, `form.readyForSale`, `form.kitchenType`,
`form.description`, `form.allergens` depuis le composant chargé — mais jamais
`form.inventoryPackaging` ni `form.packedUnits`. Ces deux champs n'étaient pas non plus initialisés
dans `data()`, donc ils valaient `undefined` en mode édition tant que l'utilisateur ne les touchait
pas manuellement. Le correctif de BUG-035 n'avait modifié que la construction des payloads, pas le
chargement — la moitié du problème (lecture) avait été oubliée.

## Correction

- `data()` : `form.inventoryPackaging: ""` et `form.packedUnits: 0` ajoutés aux valeurs initiales.
- `loadComponentData()` : ajout de `this.form.inventoryPackaging = component.inventoryPackaging || "";`
  et `this.form.packedUnits = component.packedUnits || 0;` juste après le préremplissage des
  allergènes.

## Risque de régression / à surveiller

Pas de test automatisé sur ce composant (comme noté dans BUG-035). Vérifier manuellement : éditer un
composant qui a déjà un packaging + quantité renseignés, confirmer qu'ils s'affichent bien au chargement,
sauvegarder sans les toucher, recharger, confirmer qu'ils sont toujours là.

## Références

- [35](35_component_inventorypackaging_packedunits_jamais_envoyes.md) — le bug jumeau (écriture),
  corrigé la veille ; celui-ci est le pendant côté lecture, découvert en auditant le fix à froid.
