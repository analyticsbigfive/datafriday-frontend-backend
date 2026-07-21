# BUG-202 — Famille Consolidated* : `handleOpen*FromSettings` enchaîne le handler PUIS `onClose()` → double navigation, le retour écrase la destination

- **Statut** : ⚪ Diagnostiqué (contourné dans le wrapper `/hr`, pattern non corrigé dans les composants)
- **Sévérité** : 🟡 Mineur (latent : ne mord que si les deux callbacks naviguent)
- **Domaine** : RH / Navigation (famille d'écrans prototype Consolidated*)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-21 (en écrivant le wrapper `HrView.vue`)
- **Fichiers** : `src/components/ConsolidatedHRView.vue:222-239`, `src/components/ConsolidatedAccountView.vue:350,357`, `src/components/hr/views/HrView.vue` (contournement)

## Symptôme

Depuis l'écran `/hr`, ouvrir le burger MainNav et cliquer « Events » devrait mener à `/events`.
Si le wrapper fournissait à la fois `onOpenEvents` (→ `router.push('/events')`) et `onClose`
(→ `router.push('/spaces-overview')`), l'utilisateur atterrissait sur **l'overview** : la
navigation Events était immédiatement écrasée par celle du close.

## Cause racine

Pattern hérité du prototype React (overlays empilés, pas de router) : chaque relais « FromSettings »
appelle le handler métier **puis** ferme la vue —

```js
// ConsolidatedHRView.vue:234-239
handleOpenEventsFromSettings(view) {
  if (this.onOpenEvents) {
    this.onOpenEvents(view);
    if (this.onClose) this.onClose();   // ← 2ᵉ navigation, écrase la 1ʳᵉ
  }
},
```

Même enchaînement dans `handleOpenMenuFromSettings` (:222-227) et `handleEditSpaceFromSettings`
(:228-233), et dans `ConsolidatedAccountView.handleOpenAccountFromSettings` (:357 → :350).
Dans le monde React d'origine, « fermer » retirait un overlay ; dans le monde routé Vue, `onClose`
est devenu une navigation — les deux pushes se suivent dans le même tick et le dernier gagne.

## Correction

Rien de corrigé dans les composants (écrans prototype, refonte prévue — décision utilisateur
2026-07-21 de les brancher tels quels). **Contournement dans le wrapper**
`src/components/hr/views/HrView.vue` : `onOpenEvents` volontairement **non passé** ; MainNav masque
alors l'entrée Events de lui-même (`v-if="onOpenEvents && can(...)"`, MainNav.vue:36).

Effet secondaire assumé : depuis `/hr`, pas d'accès direct à Events via le burger (passer par
l'overview). À corriger proprement lors de la refonte : supprimer l'appel `onClose()` des relais
`FromSettings` (une navigation remplace l'écran, la « fermeture » est un non-sens en mode routé),
ou faire du close un `router.back()` conditionnel.

## Risque de régression / à surveiller

- Quiconque route un autre écran Consolidated* (Account, Events) retombera dans ce piège : **ne
  pas passer de handler navigant à `onOpen*` tant que le composant appelle `onClose()` derrière**.
- Si la refonte supprime les `onClose()` en cascade, re-tester la fermeture simple (bouton X,
  ConsolidatedHRView.vue:217-221) qui, elle, doit continuer à naviguer.

## Références

- [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §2 (choix du wrapper)
- [BUG-201](201_props_double_majuscule_liaison_kebab_morte.md) (découvert au même branchement)
- [BUG-203](203_ecrans_rh_routes_restes_prototype.md) (autres restes de prototype dans ces écrans)

---

Rédaction : JLH, 2026-07-21.
