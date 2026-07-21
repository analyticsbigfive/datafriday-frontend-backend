# BUG-203 — Écrans RH routés : restes de prototype désormais visibles (crashs dialog/CSV, backend mort, bouton Profile, N+1, textes hors i18n)

- **Statut** : 🟡 Corrigé non déployé (2026-07-21, en deux temps : correctifs ciblés puis **remplacement des écrans prototype par `components/hr/` en Vuetify** — plus rien d'ouvert sur le parcours `/hr`)
- **Sévérité** : 🟠 Majeur (était 🟡 avant confirmation en navigateur : deux crashs bloquants + liste Spaces structurellement vide)
- **Domaine** : RH
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-21 (revue au moment de la mise en route sur `/hr`, complétée par la repro navigateur de l'utilisateur)
- **Fichiers** : `src/components/HRSuppliersView.vue`, `src/components/StaffPositionsView.vue`, `src/components/ConsolidatedHRView.vue:240-242`, `src/utils/api.js:5`

## Symptôme

Depuis que `/hr` est routé (étape 1 du module RH), les défauts du prototype sont exposés aux
utilisateurs. Confirmés en navigateur (repro utilisateur, 2026-07-21) :

1. **Crash à l'ouverture du dialog Add Supplier / Add Position** :
   `TypeError: Cannot read properties of undefined (reading 'length')`. Le template lit
   `SECTORS.length` / `v-for="sector in SECTORS"`, or `SECTORS` est une **const de module**
   (HRSuppliersView, StaffPositionsView) — jamais exposée à l'instance : un template Options API
   ne voit que data/computed/methods, la const rend `undefined` au premier accès.
2. **Crash sur Export CSV (et tout save/delete/import)** : `ReferenceError: toast is not defined`.
   Le prototype importait `toast` de `sonner` (lib **React**, jamais installée côté Vue) ;
   l'import a été commenté en portant les vues, **mais les ~20 appels `toast.*` sont restés**.
3. **Import CSV cassé** : `<CSVMappingDialog>` utilisé dans les deux templates avec import et
   enregistrement **commentés** → composant non résolu.
4. **Liste Spaces structurellement vide** : `loadData()` passait par `utils/api.js`, dont le
   `baseUrl` pointe l'**Edge Function Supabase du prototype KV** (`make-server-eb31619c`,
   `utils/api.js:5`) — backend mort ; `getAllSpaces` retombe silencieusement sur `[]`.
5. **Chargement N+1 séquentiel** : configs chargées `for … await` un espace à la fois, échecs
   avalés en `console.warn`.
6. **Bouton Profile mort** : avatar → « Profile » = `console.log(...)`
   (ConsolidatedHRView.vue:240-242).
7. **Textes EN codés en dur, hors i18n** (violation convention, cf. CLAUDE.md).

## Cause racine

Écrans issus du portage React/Figma Make, écrits pour un monde localStorage + Edge Function KV,
sans router ni i18n. Le portage a **commenté les imports React introuvables (`sonner`,
`CSVMappingDialog`) sans retirer leurs usages**, et gardé le client HTTP du prototype. Jamais
détecté car jamais routé (quarantaine cartographie §4) — la mise en route
([`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md)) a tout exposé d'un coup.

## Correction

Corrigé le 2026-07-21 (branche `feat/postEventInventory`), au plus près du prototype (pas de
refonte) :

1. **SECTORS exposé** via `data()` dans les deux vues (commentaire expliquant le piège const de
   module vs template Options API) → dialogs Add Supplier / Add Position s'ouvrent.
2. **Shim `toast`** local (console.info/error préfixé `[HR]`) dans les deux vues, à la place de
   l'import `sonner` commenté → save/delete/export/import ne crashent plus ; retours utilisateur
   réels reportés à la refonte.
3. **`CSVMappingDialog` réimporté/réenregistré** (le composant existe, props compatibles) →
   dialog de mapping d'import CSV fonctionnel.
4. **Bascule sur l'API moderne** : `HRSuppliersView` importe désormais
   `getSpacesLight`/`getSpaceConfigurations` de `src/api/endpoints/space.api.js` (NestJS réel,
   `/spaces/light` caché Redis) au lieu du monolithe `utils/api.js` → la liste Spaces se remplit.
   Le monolithe n'a **plus aucun consommateur RH** (cartographie §4 mise à jour).
5. **N+1 parallélisé** : configs par espace via `Promise.all`, fallback `[]` par espace.

**Second temps (même jour) — remplacement définitif.** Même corrigés, les dialogs shadcn
(`src/ui/dialog*`) restaient disloqués dans le `<v-app>` imbriqué du nouveau chrome (labels
tronqués, dialog décalé sous le rail, checkboxes invisibles — capture utilisateur). Les trois
vues prototype ont été **remplacées** par des composants Vuetify natifs :
[`components/hr/HrSuppliersTab.vue`](../../src/components/hr/HrSuppliersTab.vue),
[`HrPositionsTab.vue`](../../src/components/hr/HrPositionsTab.vue),
[`hrShared.js`](../../src/components/hr/hrShared.js) (`v-dialog`/`v-select`/`v-combobox`/
`v-snackbar`, 100 % i18n `hr…`, même couche `hrApi.js` et shapes localStorage préservés ;
import CSV simplifié en auto-mapping par en-têtes). Ce remplacement solde les points 6 (le
bouton Profile mort appartenait à `ConsolidatedHRView`, plus rendu) et 7 (nouveaux écrans
traduits EN/FR). `ConsolidatedHRView`/`HRSuppliersView`/`StaffPositionsView` retournent en
quarantaine « à supprimer » (cartographie §4) — leurs correctifs du premier temps restent
utiles à qui les exhumerait.

## Risque de régression / à surveiller

- Re-tester en navigateur : Add Supplier (liste Spaces réelle), save, Export CSV (fichier
  téléchargé, message en console `[HR]`), Import CSV (dialog de mapping), Add Position.
- `getSpacesLight` renvoie `{id, name}` seulement — suffisant pour les checkboxes et
  `getSpaceNames`, mais toute future fonctionnalité lisant d'autres champs de `this.spaces`
  devra passer sur `getAllSpaces()` (paginé à 100).
- Les toasts sont devenus silencieux (console) : une erreur de save n'est plus visible à
  l'écran — à rebrancher sur un vrai système de notification lors de la refonte.
- Au passage BDD (étape 2), re-tester la persistance des suppliers référencés par des positions
  (`StaffPositionsView` référence `supplierId`).

## Références

- [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §4 (tensions assumées) et §6.3 (étape 2)
- [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #29 (persistance BDD)
- [BUG-201](201_props_double_majuscule_liaison_kebab_morte.md), [BUG-202](202_consolidated_views_double_navigation_onclose.md)

---

Rédaction : JLH, 2026-07-21.
