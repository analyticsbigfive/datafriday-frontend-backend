# BUG-153 — Phase 2 : endpoints tenant-wide non scopés (tradeoff délibéré, documenté)

- **Statut** : ⚫ Won't fix (tradeoff assumé, annoté en code — ne pas « corriger » sans mesure)
- **Sévérité** : 🟡 Mineur/perf (bande passante phase 2, hors chemin bloquant)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18 (formalisation d'annotations code existantes)
- **Fichiers** : `src/composables/useSpaceData.js:158-187` (phase 2)

## Symptôme

La phase 2 (arrière-plan, après premier rendu) charge plusieurs référentiels **tenant-wide** :
`getProductMappings()` (sans scope location), `getWeezeventProducts` (catalogSpaceId seulement),
`getIngredients()`, `getAllPackagingTypes()` — payloads plus gros que le strict besoin de l'espace.

## Cause racine

Tradeoffs délibérés, annotés en code :
- `getWeezeventProducts` : passer `spaceId` déclenchait une cascade de repli de prix scopée-espace qui **annulait la requête après > 1 min** (gotcha noté au 1er test) ; le prix modal global est rapide.
- `getProductMappings(locationId)` filtre par location Weezevent, pas par spaceId — pas de résolution spaceId→locationId sans appel réseau supplémentaire.

## Correction

Aucune, par choix. La phase 2 tourne déjà en arrière-plan (`onEnrichment`) et ne bloque pas le premier rendu — l'objectif 300ms porte sur la phase 1. Re-scoper sans lever d'abord les deux gotchas ci-dessus REPRODUIRAIT le bug de cascade > 1 min.

## Risque de régression / à surveiller

Si un backend futur expose des variantes scopées rapides, reprendre cette fiche.

## Références

- Annotations dans `useSpaceData.js:167-179`
