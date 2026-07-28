# BUG-035 — Component : "is stored in" (packaging) et quantité par carton jamais envoyés au backend

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (champ silencieusement non sauvegardé)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Sur `/components/create` et `/components/edit/:id`, la carte "Inventory Information" propose de
choisir un packaging ("... is stored in [Packaging ▾] of [Qty] [unit]") via `form.inventoryPackaging`
et `form.packedUnits`. L'utilisateur peut remplir ces deux champs, la sauvegarde réussit sans
erreur — mais en rechargeant le composant, les valeurs sont toujours vides : rien n'a été persisté.

## Cause racine

`form.inventoryPackaging` et `form.packedUnits` étaient bien liés au template (`v-model`) et donc
saisissables, mais les deux méthodes `onCreate()` et `onUpdate()`
(`ComponentCreateView.vue`, payloads de `createMenuComponent`/`updateMenuComponent`) ne les
incluaient jamais dans l'objet envoyé à l'API — alors que `CreateMenuComponentDto`
(`backend: create-menu-component.dto.ts:295-304`) supporte ces deux champs (`packedUnits`,
`inventoryPackaging`) et que `MenuComponentsService` les persiste déjà correctement côté Prisma
quand ils sont reçus. Un pur oubli côté construction du payload frontend — le backend n'a jamais
été en cause.

Bug préexistant, non introduit par le portage de fonctionnalités depuis `old-web` du même jour —
découvert en auditant systématiquement, à la demande de l'utilisateur, tous les champs envoyés au
backend par les fichiers touchés ce jour-là.

## Correction

Ajout de `inventoryPackaging: this.form.inventoryPackaging || undefined,` et
`packedUnits: Number(this.form.packedUnits) || 0,` aux deux payloads (`onCreate` et `onUpdate`).
Aucun changement backend nécessaire (DTO et service supportaient déjà ces champs).

## Risque de régression / à surveiller

Pas de test automatisé sur ce composant. Vérifier manuellement : créer/éditer un Component, remplir
"is stored in" + quantité, recharger la page, confirmer que les deux valeurs sont bien restaurées.

## Références

- Bug voisin (même symptôme "champ UI non persisté", sur Menu Item cette fois) :
  [31](31_kitchentype_traductions_manquantes_inventory_menu_item.md) (note sur `inventoryUnit`
  volontairement front-only, à ne pas confondre avec ce bug-ci qui est un oubli non voulu).
- Fiche liée découverte le même jour : [34](34_supplier_notes_jamais_persiste_mirror.md).
- **Suite** : [53](53_component_inventorypackaging_packedunits_jamais_restaures_edition.md) — ce
  correctif ne couvrait que l'écriture (payload) ; la lecture (`loadComponentData`) avait le même
  oubli côté restauration en édition, découvert en auditant le fix à froid le même jour.
