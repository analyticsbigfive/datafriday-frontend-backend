# BUG-128-02 — Cache Redis jamais invalidé après create/update/delete (double préfixe)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Achats & référentiels
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/features/menu-components/menu-components.service.ts`, `src/features/ingredients/ingredients.service.ts`

## Symptôme

Après suppression ou duplication d'un composant (`MenuComponent`), l'élément supprimé restait
visible dans la liste, et l'élément dupliqué mettait un temps anormalement long à apparaître —
jusqu'à expiration naturelle du TTL de cache (60s). Signalé par l'utilisateur côté front
(voir [BUG-323-02](../../../frontend/docs/bugs/323_02_composants_liste_ne_se_rafraichit_pas_duplication_suppression.md)).

## Cause racine

`invalidateCache(tenantId)` construit le pattern à supprimer avec le préfixe `datafriday:` déjà
inclus en dur :

```ts
private async invalidateCache(tenantId: string) {
  await this.redis.deletePattern(`datafriday:menu-components:${tenantId}:*`);
}
```

Or `RedisService.deletePattern(pattern)` préfixe **déjà** automatiquement avec `datafriday:` en
interne (`buildKey`, confirmé par les tests unitaires de `RedisService` : `deletePattern('user:*')`
doit être appelé **sans** le préfixe). Résultat : un pattern doublement préfixé
(`datafriday:datafriday:menu-components:...`) qui ne correspond à **aucune** clé réelle en cache —
`redis.keys()` ne trouve jamais rien à supprimer, donc le cache liste (`findAll`, TTL 60s dans
`menu-components.service.ts`) n'était en réalité **jamais** invalidé après une mutation. Même bug,
même cause, dans `ingredients.service.ts`.

## Correction

Suppression du préfixe manuel redondant dans les deux services :

```ts
await this.redis.deletePattern(`menu-components:${tenantId}:*`);   // menu-components.service.ts
await this.redis.deletePattern(`ingredients:${tenantId}:*`);       // ingredients.service.ts
```

Confirmé correct par les tests unitaires existants de `RedisService` (`deletePattern` sans préfixe
manuel) et par comparaison avec les autres services du repo qui appellent `deletePattern`
correctement (ex. `menu-items.service.ts:77`, `space-menus.service.ts:49-50`) — seuls ces deux
services avaient le bug.

## Risque de régression / à surveiller

Fix strictement correctif (retire un préfixe en trop), aucun changement de comportement pour le cas
nominal. À vérifier en conditions réelles : supprimer/dupliquer un composant ou un ingrédient et
confirmer que la liste (`GET /menu-components`, `GET /ingredients`) reflète le changement
immédiatement au prochain appel, sans attendre le TTL. `npx tsc --noEmit` passe. Tests unitaires
`RedisService` et `menu-components.service.spec.ts` passent (`npx jest`).

## Références

- [`323_02_composants_liste_ne_se_rafraichit_pas_duplication_suppression.md`](../../../frontend/docs/bugs/323_02_composants_liste_ne_se_rafraichit_pas_duplication_suppression.md) (symptôme front associé).
