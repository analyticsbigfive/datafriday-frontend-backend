# BUG-072 — `onRefreshCosts` : échec silencieux pour l'utilisateur

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue:848-858`

## Symptôme

Si `refreshMenuItemsCosts()` échoue (500, timeout — le backend `/menu-items` est documenté comme
lent), le bouton "Recalculer les coûts" arrête simplement de tourner : aucun message d'erreur n'est
affiché, l'utilisateur croit que les coûts ont été recalculés alors que rien n'a changé.

## Cause racine

```js
async onRefreshCosts() {
  this.refreshing = true;
  try {
    await refreshMenuItemsCosts();
    await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
  } catch (e) {
    console.error('Error refreshing costs:', e); // seule action : log console
  } finally {
    this.refreshing = false;
  }
},
```

## Correction

Le `catch` affiche désormais `e?.userMessage || e?.message` dans un bandeau d'erreur visible
(même mécanisme que `onExportCsv`), au lieu de se contenter d'un `console.error`.

## Risque de régression / à surveiller

Vérifier que le bandeau d'erreur se referme bien à la prochaine action réussie et ne reste pas
affiché indéfiniment après un premier échec suivi d'un succès.

## Références

- Aucune.
