# BUG-079 — Logs de debug et `alert()` natif laissés en production dans MenuItemCreateView.vue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:1213,1259,1370,1504-1509`

## Symptôme

La console utilisateur affiche le payload complet envoyé au backend
(`console.log("Menu Item Payload:", payload)`) ainsi que les objets `menuItem`/`form`/`items`
complets à chaque chargement. Par ailleurs, l'échec de chargement d'un article utilise un
`alert()` navigateur bloquant, incohérent avec le bandeau `v-alert`/`saveError` utilisé partout
ailleurs dans le même formulaire.

## Cause racine

`console.log` de debug non retirés après développement ; `alert()` natif utilisé au lieu du
mécanisme d'erreur existant du composant.

## Correction

Tous les `console.log` de debug retirés. L'échec de chargement d'un article en édition affiche
désormais le même bandeau `saveError` que le reste du formulaire au lieu d'un `alert()` bloquant.

## Risque de régression / à surveiller

Aucun — retrait de code de debug et remplacement d'un mécanisme d'erreur par un autre déjà en
place dans le même fichier.

## Références

- [[65_component_logs_debug_laisses_en_production]] (même pattern déjà traité sur `/components`).
