# BUG-236-02 — `CsvImportDrawer.vue` : dropdowns Espaces/Configs/Types/Catégories/Sous-catégories vides sans aucune indication (échec de fetch avalé)

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **non vérifié en navigateur** — cf. « Risque de régression »)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (computed `spaces`/`eventTypes`/
  `eventCategories`/`eventSubcategories`/`allLoadedConfigurations`, watcher `modelValue`, méthode
  `navigateForward`)

## Symptôme

À l'étape 3 ("Espaces") de l'import CSV d'événements, le dropdown de mapping est vide (aucune
option), sans aucun message d'erreur ni indicateur de chargement — juste un select vide. Signalé
par l'utilisateur comme bloquant l'import (impossible d'associer les valeurs du fichier à un
espace).

## Cause racine

Le watcher `modelValue` (ouverture du drawer) déclenchait le chargement des référentiels
(`spaces/fetchSpaces`, `eventTypes/fetchEventTypes`, etc.) via `Promise.allSettled([...])` **sans
jamais lire le résultat** :

```js
watch: {
  modelValue(v) {
    if (v) {
      Promise.allSettled([
        this.$store.dispatch('spaces/fetchSpaces'),
        ...
      ]);
    }
  },
},
```

`Promise.allSettled` ne rejette jamais — si `spaces/fetchSpaces` échoue (réseau, 403 RBAC sur
`GET /spaces` si l'utilisateur n'a pas `allSpacesAccess`/`isOwner` et aucun octroi explicite dans
`UserSpaceAccess`, timeout…), l'échec est **totalement silencieux** : le dropdown reste vide, sans
aucun signal pour l'utilisateur ni moyen de relancer le chargement autrement qu'en fermant/rouvrant
le drawer. Même mécanisme pour les configurations, chargées séparément dans `navigateForward()`
avec un `.catch(() => [])` qui absorbe explicitement l'erreur.

Un cas légitime existe aussi (pas un bug en soi) : un utilisateur restreint via RBAC
(`backend/src/core/auth/space-access.service.ts` — accès complet réservé à super-admin/owner/
`allSpacesAccess`, sinon strictement les espaces accordés via `UserSpaceAccess`) peut n'avoir accès
à **aucun** espace si aucun octroi explicite n'existe pour son compte, même si le tenant possède des
espaces. Dans ce cas la liste vide est correcte, mais l'absence totale de message la rend
indiscernable d'un bug.

## Correction

- Le watcher appelle désormais `loadTaxonomies()`, qui `await`e chaque fetch, capture individuellement
  les rejets (`taxonomyErrors.{spaces,eventTypes,eventCategories,eventSubcategories}`) et expose un
  état `taxonomyLoading`.
- `navigateForward()` délègue au chargement des configurations à `loadConfigsForCurrentSpaces()`
  (même logique : plus de `.catch(() => [])` muet, erreur capturée dans `configsLoadError` /
  `configsLoading`).
- Chaque étape de mapping (3 à 7) affiche désormais un état explicite avant la liste de mapping :
  erreur (avec bouton "Réessayer" rappelant `loadTaxonomies`/`loadConfigsForCurrentSpaces`),
  chargement en cours, ou liste vide avec message dédié ("Aucun espace accessible avec votre
  compte. Vérifiez vos droits d'accès…" pour les espaces, "Aucun type d'événement n'existe encore
  pour ce compte." etc. pour les référentiels génériques).

## Risque de régression / à surveiller

- **Non vérifié en navigateur** (contrainte de session : impossible de démarrer/redémarrer le
  serveur de dev de l'utilisateur). À tester manuellement : ouvrir l'import CSV, vérifier que
  l'état de chargement s'affiche puis se résorbe, qu'une erreur réseau simulée (ex. couper le
  backend) affiche bien le message d'erreur + bouton Réessayer, et que la liste réelle d'espaces
  apparaît pour un compte avec accès.
- **Si le dropdown Espaces reste vide après ce correctif** avec le nouveau message "Aucun espace
  accessible avec votre compte" (pas un message d'erreur réseau), la cause est RBAC côté backend
  (`UserSpaceAccess` vide pour ce compte) — à vérifier/corriger côté administration des accès, pas
  un bug de ce composant. Comparer avec le dropdown Espace du formulaire manuel
  (`EventFormDrawer.vue`, même store `spaces`) : si lui aussi est vide pour ce compte, ça confirme
  la piste RBAC.

## Références

- `backend/src/core/auth/space-access.service.ts` (règle d'accès aux espaces)
- [BUG-237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) — illisibilité du
  menu déroulant en dark mode, même composant
- [BUG-238-02](238_02_csvimportdrawer_champs_taxonomie_perdus_silencieusement.md) — conséquence en
  cascade : champs Espace/Config/Type/Catégorie/Sous-catégorie perdus silencieusement à l'import
