# BUG-129 — Space Menus : petits soucis UX/a11y (focus clavier invisible, état "sans configuration", input file non réinitialisé)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuShopView.vue:198-205`,
  `src/components/menu-fb/views/space-menus/drawers/ShopDetailEditDrawer.vue:41-43`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue`

## Symptôme / Cause racine

Trois petits points UX/a11y sans lien entre eux, relevés lors de l'audit :

1. **Bouton "éditer" invisible au focus clavier** (`SpaceMenuShopView.vue:198-205`) :
   `.smsh-card__edit { opacity: 0 }` ne devient visible qu'au survol (`.smsh-card:hover`), sans
   règle `:focus`/`:focus-visible` — le bouton est atteignable au clavier (Tab) et fonctionnel,
   mais invisible pour un utilisateur naviguant sans souris.
2. **Pas d'état distinct « espace sans configuration »** (`SpaceMenuView.vue`) : si un espace n'a
   aucune configuration, `selectedConfigId` reste `null`, `shops` retombe sur `[]`, et
   `SpaceMenuShopView` affiche le message générique « aucun shop dans cet espace » — message
   trompeur, la vraie cause (aucune configuration n'existe pour choisir des shops) n'est pas
   communiquée.
3. **Le bouton "retirer l'image" ne réinitialise pas l'`<input type="file">`**
   (`ShopDetailEditDrawer.vue:41-43`) : `form.image = ''` sans reset de `$refs.imgInput.value` — si
   l'utilisateur retire une image puis tente de re-sélectionner exactement le même fichier, le
   navigateur ne redéclenche pas `@change` (liste de fichiers identique), et le re-upload ne fait
   silencieusement rien tant qu'un fichier différent n'est pas choisi.

## Correction

- Règle `:focus-visible` ajoutée en miroir de `:hover` sur `.smsh-card__edit`.
- Message distinct ajouté quand `selectedSpaceId` est défini mais `configOptions.length === 0`
  (« cet espace n'a pas encore de configuration » plutôt que « aucun shop »).
- `ShopDetailEditDrawer.vue` réinitialise `this.$refs.imgInput.value = ''` au clic sur "retirer
  l'image".

## Risque de régression / à surveiller

- Naviguer au clavier (Tab) jusqu'à une carte shop : le bouton éditer doit devenir visible au
  focus, pas seulement au survol souris.
- Retirer une image puis re-sélectionner le même fichier dans le tiroir d'édition shop : l'aperçu
  doit se remettre à jour.

## Références

- Aucune.
