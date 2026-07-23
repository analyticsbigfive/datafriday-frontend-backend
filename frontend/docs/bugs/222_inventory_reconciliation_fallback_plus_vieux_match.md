# BUG-222 — Réconciliation d'inventaire rattachée au plus VIEUX match passé au lieu du dernier fini

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (le document de réconciliation compare le comptage aux ventes du mauvais match : `soldUnits`, `leftFromSales`, `missingUnits` et « Miss € » sont tous faux)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md`)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (session de vérification de la logique Pre/Post-event contre la spec métier)
- **Fichiers** : `src/views/SpaceInventoryView.vue:863-871` (tri de `pastEvents`), `:1792-1801` (`resolveReconciliationEvent`), `src/store/modules/inventory.js:321-343` (`resolveLastPastEvent`, résolveur correct non branché)

## Symptôme

À la sauvegarde d'un comptage (« Générer la réconciliation », post-event comme pre-event), quand
l'événement du contexte écran n'a pas encore eu lieu — le **cas nominal** : l'écran s'ancre par
défaut sur le prochain match futur via `resolveEventContext()` — le document de réconciliation
créé est rattaché au **plus vieux** match passé du space, pas au dernier fini.

Repro exacte : space avec au moins 2 matchs passés → ouvrir `/spaces/:spaceId/inventory` sans
`?event=` (le contexte s'ancre sur le prochain match futur) → compter → « Générer la
réconciliation » → le document affiche le nom du **premier match historique** du space, et ses
colonnes Qty Sold / Qty left / Missing sont calculées contre les ventes de ce vieux match.

Avec un seul match passé, le bug est invisible (index 0 = dernier) — c'est probablement pourquoi
il a échappé aux tests manuels.

## Cause racine

`resolveReconciliationEvent()` retournait `pastEvents[0]` en fallback :

```js
// SpaceInventoryView.vue:1798-1800 (avant)
const current = (this.events || []).find((e) => String(e.id) === String(this.selectedEventId))
if (current && isPast(current)) return current
return (this.pastEvents || [])[0] || null
```

Or la computed `pastEvents` (`:863-871`) trie **ascendant** (`new Date(a) - new Date(b)`) :
l'index 0 est donc le match le plus **ancien**. Le commentaire de la méthode (`:1786-1791`)
annonce pourtant « le dernier event passé du space ».

L'action store `inventory/resolveLastPastEvent` (`store/modules/inventory.js:321-343`) fait le
tri décroissant correct **et** filtre par `spaceId`, mais n'était branchée nulle part sur ce
chemin (action morte, déjà signalée dans `10_POST_EVENT_INVENTORY.md` § 2).

## Correction

Fix minimal appliqué le 2026-07-20 sur `feat/postEventInventory` : prendre le **dernier** élément
de la liste ascendante.

```js
// SpaceInventoryView.vue (après)
// pastEvents est trié ascendant : le dernier élément est le dernier match fini.
const past = this.pastEvents || []
return past[past.length - 1] || null
```

Piste follow-up (non faite ici) : brancher `inventory/resolveLastPastEvent`, qui apporte en plus
le **filtre `spaceId`** — `pastEvents` ne filtre pas par space ; si le store `analyse.events`
contient des events de plusieurs spaces, le fallback peut viser un match d'un autre space (bug
latent distinct, non observé à ce jour car les events sont chargés par space).

## Risque de régression / à surveiller

- Les **deux** chemins de création passent par cette méthode : `createReconciliationAfterSave`
  (post-event) et `createPreReconciliationAfterSave` (pre-event) — retester les deux.
- Cas 1 seul match passé : comportement inchangé (index 0 = dernier).
- Cas aucun match passé : retour `null` → toast `invRecoNoPastEvent`, inchangé.
- **Données déjà écrites** : les réconciliations créées avant le fix sur un space multi-matchs
  peuvent référencer le mauvais event — pas de backfill automatique, à purger/recréer à la main
  si observées.
- Pas de test unitaire ajouté : la logique vit dans une méthode de composant ; l'extraction en
  util pur (comme `postEventReconciliation.js`) est la voie si on veut la couvrir.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) § 7.1 (flux de
  création, corrigé) et § « Vérification de la logique métier ».
- Q25 / Q26 de [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) (divergences serveur
  relevées dans la même session de vérification).

---

Rédaction : **JLH**, 2026-07-20.
