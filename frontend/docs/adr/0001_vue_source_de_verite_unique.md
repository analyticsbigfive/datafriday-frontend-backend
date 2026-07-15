# ADR-0001 — datafriday-web/src/ est l'unique source de vérité front

- **Statut** : Accepté
- **Date** : formalisé le 2026-07-15 (pratique héritée de l'historique du projet)
- **Domaine** : Architecture technique (transverse)

## Contexte

Le projet a connu plusieurs itérations de prototypage avant le code Vue actuel : un tout premier
prototype (Supabase KV, 2024), un prototype React (Figma Make, 2025) laissé dans `versionReact/`
(94 composants `src/ui`, `src/figma`, `src/hooks`, `src/types`), et une copie d'un ancien backend
dans `api-datafriday-main/`. Ces artefacts créent un risque de confusion réel — du code mort qui
ressemble à du code vivant — pour tout nouveau dev ou agent qui explore le repo sans ce contexte
(confirmé lors de la confrontation prototype/code réel du 2026-07-15 : le prototype React ne
décrit fidèlement le code Vue en prod que sur une partie des règles métier).

## Décision

`datafriday-web/src/` est l'unique source de vérité front. `versionReact/` = prototype archivé,
**lecture interdite sauf archéologie explicitement demandée**. `api-datafriday-main/` = copie d'un
ancien backend, **ne jamais s'y référer**.

## Conséquences

Toute doc, analyse ou code doit citer `src/`, jamais `versionReact/` ou `api-datafriday-main/` sauf
mention explicite "archéologie" (voir `docs/utiles/prototypes/` pour ce cas d'usage assumé). Ces
deux dossiers sont candidats à la suppression complète — ils ont déjà été mis en quarantaine lors
du nettoyage du 2026-07-15 (`old/`, gitignoré).

## Références

- `CARTOGRAPHIE_MODULES.md`
- `docs/utiles/prototypes/00_INDEX_ET_SYNTHESE.md`
