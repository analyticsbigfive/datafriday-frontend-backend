# BUG-200 — Snapshot inventaire : `kind` rejeté en 400 (« property kind should not exist ») par un backend compilé avant le DTO

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix = redémarrer/redéployer le backend avec `6491562` inclus — pas de changement de code)
- **Sévérité** : 🔴 Bloquant (la sauvegarde du comptage échoue → tout le cycle pre/post-event est inutilisable : ni snapshot, ni réconciliation)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md`)
- **Repo(s) concerné(s)** : backend (déploiement), aucun code fautif
- **Découvert le** : 2026-07-20 (tentative de génération de la réconciliation post-event)
- **Fichiers** : `backend/src/features/inventory/dto/create-inventory.dto.ts:19-21` (déclaration `kind`, correcte), `backend/src/main.ts:86-87` (ValidationPipe global `whitelist` + `forbidNonWhitelisted`), `src/store/modules/inventory.js:239-244` (envoi du `kind` côté front), `src/views/SpaceInventoryView.vue:1702-1705` (dispatch avec `kind`)

## Symptôme

Au clic « Générer la réconciliation » (post-event comme pre-event), la sauvegarde du snapshot
échoue : `POST /inventory` répond **400** avec le message class-validator
`property kind should not exist`. Le flux s'arrête là — le document de réconciliation n'est
jamais créé (la création n'intervient qu'après un save réussi,
`SpaceInventoryView.vue` → `onSaveAll` → `createReconciliationAfterSave`).

## Cause racine

**Pas un bug de code** : les deux côtés sont corrects et cohérents dans le repo.

- Le front envoie `kind: 'pre-event' | 'post-event'` dans le payload du snapshot
  (`store/modules/inventory.js:243`, spread conditionnel `...(kind ? { kind } : {})`).
- Le DTO backend `CreateInventoryDto` déclare bien le champ avec
  `@IsOptional() @IsIn(['pre-event', 'post-event'])`
  (`create-inventory.dto.ts:19-21`) — donc whitelisted pour le ValidationPipe global
  (`main.ts:86-87`, `whitelist: true` + `forbidNonWhitelisted: true`).

Le message « property X should not exist » est celui que `forbidNonWhitelisted` émet pour un
champ **sans décorateur**. Il ne peut donc provenir que d'un **serveur exécutant un build
antérieur** au commit `6491562` (« feat: add post-event reconciliation and pre-event expected
utilities »), qui a introduit `kind` dans le DTO. NestJS ne recharge pas les DTO d'un `dist/`
déjà compilé : process local lancé avant le commit, ou déploiement Render pas encore à jour.

## Correction

Aucun changement de code. Redémarrer le backend local (`npm run start:dev` côté `backend/`)
ou vérifier que le déploiement Render inclut `6491562`. Après redémarrage, le save passe et la
réconciliation se crée normalement (le `POST /spaces/:id/reconciliations/post-event` n'envoie
d'ailleurs pas de `kind` — seul le save du snapshot était touché).

## Risque de régression / à surveiller

- **Récurrent par nature** : tout ajout de champ DTO reproduit ce symptôme tant que le backend
  n'est pas relancé/redéployé. Réflexe diagnostic : « property X should not exist » alors que le
  DTO du repo déclare X ⇒ vérifier d'abord la fraîcheur du build backend avant de chercher un
  bug de code.
- Après redémarrage, retester les deux chemins (pre-event et post-event) : save snapshot avec
  `kind`, puis création du document de réconciliation.
- Aucune donnée corrompue : le 400 est atomique, rien n'a été écrit.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) § 8 (cycle
  pre↔post, discrimination des snapshots par `kind`).
- [`194_inventory_reconciliation_fallback_plus_vieux_match.md`](194_inventory_reconciliation_fallback_plus_vieux_match.md)
  (même flux de création, session de vérification voisine).
- Commit `6491562` — introduction de `kind` dans `CreateInventoryDto`.

---

Rédaction : **JLH**, 2026-07-20.
