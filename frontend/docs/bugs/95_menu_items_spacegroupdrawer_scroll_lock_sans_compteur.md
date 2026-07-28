# BUG-095 — SpaceGroupDrawer : verrou de scroll body sans compteur de référence

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/SpaceGroupDrawer.vue:167-174`

## Symptôme

`MenuItemCreateView.vue` monte deux instances de `SpaceGroupDrawer` (vue "groupe de prix" et
sélection d'espaces). Si les deux drawers venaient à être ouverts l'un après l'autre sans fermer le
premier, la fermeture du second remet `overflow: ''` alors que le premier est visuellement toujours
ouvert — le scroll de fond se réactive derrière un drawer encore affiché.

## Cause racine

```js
watch: { modelValue(val) { document.body.style.overflow = val ? 'hidden' : ''; ... } }
```

Mutation directe d'un état global partagé (`document.body.style`), sans compteur/registre —
chaque instance écrase l'état de l'autre.

## Correction

Verrou de scroll centralisé via un compteur partagé (module-level, incrémenté à l'ouverture,
décrémenté à la fermeture) : `overflow: hidden` n'est retiré que quand le compteur retombe à 0,
quel que soit le nombre d'instances de `SpaceGroupDrawer` ouvertes simultanément.

## Risque de régression / à surveiller

Vérifier qu'un rechargement de page (unmount brutal du composant sans passer par le watcher, ex.
navigation) ne laisse pas le compteur bloqué à une valeur positive — le compteur étant réinitialisé
au rechargement complet de l'app (module-level state), ce cas est déjà couvert naturellement.

## Références

- Aucune.
