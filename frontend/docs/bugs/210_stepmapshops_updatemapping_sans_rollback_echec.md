# BUG-210 — `updateMapping` ne fait jamais de rollback en cas d'échec de sauvegarde : compteur et onglets mentent

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapShops.vue:1379-1411`

## Symptôme

`updateMapping` met à jour `this.localMappings[locationId]` de façon optimiste (lignes 1381-1387)
**avant** l'appel API. En cas d'échec non-409 (400/500/timeout réseau), le `catch` (1402-1409) se
contente de `savingRows[locationId]='error'` — il ne restaure jamais `localMappings`.
Conséquences, toutes atteignables via un simple appel de création en échec :
- La ligne reste classée "mappée" — elle bascule dans l'onglet "Mapped" (et sort de "Unmapped").
- `mappedCount`/`unmappedCount` (utilisés pour le badge de progression, la bannière d'avertissement
  bloquante, et pour activer le bouton principal "Enregistrer"/finir,
  `:disabled="mappedCount === 0 || ..."`) deviennent **gonflés**, pouvant permettre de marquer
  l'étape du wizard comme terminée (`handleSave` émet `completed` avec le `mappedCount` gonflé)
  alors qu'une location n'a jamais été réellement mappée côté serveur.
- Seul un rechargement de page (qui refetch `getLocationShopMappings` depuis le serveur, ligne
  1146) révèle la vérité — la ligne revient à "non mappée", contredisant silencieusement ce que
  l'utilisateur a vu et validé.
- Cette asymétrie est confirmée par contraste : `applyAutoSuggestions` (chemin en masse) **fait**
  bien un rollback de `localMappings` en cas d'échec — seul le chemin ligne-par-ligne
  (`updateMapping`, déclenché à chaque changement manuel de select et chaque suggestion acceptée)
  en est dépourvu.

## Cause racine

Le rollback des mises à jour optimistes a été implémenté pour le chemin en masse mais omis du
chemin ligne-par-ligne.

## Correction

`updateMapping` capture désormais `previousElementId = this.localMappings[locationId]` avant la
mise à jour optimiste. Dans la branche `catch` non-409, en plus de
`savingRows[locationId] = 'error'`, `localMappings[locationId]` est restauré à
`previousElementId` (ou supprimé si `previousElementId` était `null`/`undefined`), symétriquement
à ce que fait déjà `applyAutoSuggestions`. Le compteur `mappedCount`/`unmappedCount` et l'onglet
de la ligne reflètent donc à nouveau l'état réellement persisté côté serveur après un échec.

## Risque de régression / à surveiller

Corréler avec BUG-211 (même méthode, cas particulier de la suppression de mapping — encore plus
grave car aucune erreur visible du tout) et BUG-213 (StepMapMenuItems, bouton "Suivant" pas gardé
contre un état incomplet).

## Références

- BUG-211 (suppression de mapping en échec, invisible).
- BUG-003 (`docs/bugs/03_badge_etage_reset_stepmapshops.md`, même fichier, autre classe de bug).
