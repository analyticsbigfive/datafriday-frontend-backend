# BUG-311-03 — EventsListView : la colonne « Configuration » ne se met pas à jour après création d'un event

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (affichage — donnée bien persistée)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-11
- **Fichiers** : `src/components/events/views/EventsListView.vue` — `loadConfigNames()`, handlers `@submitted`/`@imported`, computed `mappedEvents` (colonne `configuration`)

## Symptôme

Après avoir créé (ou édité / importé) un event avec une configuration, la colonne
« Configuration » du tableau reste vide (`—`) pour ce nouvel event, alors que la configuration est
bien enregistrée. Elle n'apparaît qu'après un rechargement complet de la page.

## Cause racine

La colonne affiche `configuration: (e.configurationId && this.configNameById[e.configurationId]) || ''`.
La map `configNameById` (configId → nom) est construite par `loadConfigNames()`, qui résout les
configs des espaces référencés par les events (store `spaceConfigurations` stateless → fetch par
espace). Or `loadConfigNames()` n'était appelé **qu'au `mounted()`**.

À la création, le template ne rafraîchissait que la liste :
```html
@submitted="loadEvents({ forceRefresh: true })"
```
→ les events étaient bien rechargés, mais `configNameById` restait figée → le `configurationId` du
nouvel event n'était pas résolu (surtout si l'event vise un espace/config non encore chargé).

## Correction

Ajout d'un handler `onEventSaved()` qui rafraîchit la liste **puis** re-résout les configs, branché
sur `@submitted` (EventFormDrawer) et `@imported` (import CSV) :
```js
async onEventSaved() {
  await this.loadEvents({ forceRefresh: true });
  this.loadConfigNames();
},
```

## Risque de régression / à surveiller

- Vérifier qu'après création/édition/import, la colonne « Configuration » affiche bien le nom (et
  toujours `—` quand l'event n'a pas de configuration).
- `loadConfigNames()` refait un `fetchForSpace` par espace distinct à chaque save — acceptable (peu
  d'espaces) ; si le volume d'espaces devient grand, envisager de ne résoudre que les espaces
  nouvellement apparus plutôt que toute la map.

## Références

- Feature : colonne « Configuration » de la liste des événements (résolution via `spaceConfigurations/fetchForSpace`, même mécanisme que l'export CSV).
- Module : [`modules/07_EVENEMENTS.md`](../modules/07_EVENEMENTS.md)
