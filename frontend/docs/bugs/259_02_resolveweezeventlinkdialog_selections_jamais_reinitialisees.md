# BUG-259-02 — `ResolveWeezeventLinkDialog` : sélections jamais réinitialisées, valeur d'une ouverture précédente affichée comme pré-sélectionnée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31, capture d'écran utilisateur : le dialogue "Résoudre les liens
  Weezevent" affiche "PARIS FOOTBALL CLUB" déjà sélectionné pour "PFC-Nantes" à l'ouverture, sans
  action de l'utilisateur.
- **Fichiers** : `src/components/integration/wizard/dialogs/ResolveWeezeventLinkDialog.vue`
  (`data().selections`, ligne 66)

## Symptôme

À l'ouverture du dialogue de résolution des liens Weezevent ambigus (une ligne par événement
partageant sa date avec plusieurs candidats Weezevent), une ligne affiche un candidat déjà
sélectionné dans son `<v-select>` alors qu'aucune correspondance automatique univoque n'existe pour
ce cas précis (c'est justement pour ça que la ligne apparaît dans "événements ambigus" plutôt que
d'avoir été liée automatiquement côté backend). Une autre ligne du même dialogue affiche
normalement un select vide et un bouton "LIER" désactivé — ce second comportement est correct.

## Cause racine

`selections` (`data()`, ligne 66) n'est jamais réinitialisé : ni à l'ouverture du dialogue (aucun
`watch` sur `modelValue`), ni quand la prop `matches` change. Le seul point d'écriture est
`v-model="selections[match.eventId]"` (ligne 16), piloté uniquement par l'utilisateur. Le composant
`ResolveWeezeventLinkDialog` restant monté entre deux ouvertures (le `v-dialog` est piloté par
`modelValue`, pas par un `v-if` qui démonterait l'instance), toute sélection faite lors d'une
ouverture précédente — ou pour un `eventId` déjà rencontré dans une session antérieure — persiste
dans l'état du composant et réapparaît pré-remplie à la réouverture. Il n'existe aucun code qui
calcule une vraie suggestion automatique ici (le matching "même date" est fait côté backend, voir
`getAmbiguousWeezeventMatches`) : la valeur pré-affichée est un résidu d'état, pas une suggestion.

Le bouton "LIER" désactivé sur la seconde ligne du screenshot n'est pas un bug — `:disabled="!selections[match.eventId]"`
(ligne 33) est juste vrai tant qu'aucun choix n'a été fait pour cette ligne précise.

## Correction

Ajout d'un `watch(modelValue)` qui vide `selections` à chaque ouverture du dialogue
(`isOpen === true`). Volontairement **pas** de reset sur simple changement de `matches` : quand une
ligne est résolue et retirée de la liste pendant que le dialogue reste ouvert, on ne veut pas
perdre la sélection en cours d'une autre ligne non encore confirmée.

## Risque de régression / à surveiller

- À reproduire pour valider : ouvrir le dialogue, sélectionner un candidat pour une ligne sans
  cliquer "LIER", fermer le dialogue, le rouvrir avec une nouvelle liste de matches (ou la même) →
  aucune option ne doit être pré-sélectionnée.
- Vérifier qu'une résolution partielle (une ligne liée, dialogue resté ouvert car il reste des
  matches) conserve bien la sélection en cours de l'autre ligne (pas de reset intempestif).
- Pas de test unitaire ajouté (pas de suite de tests existante pour ce composant).

## Références

- `docs/bugs/214_stepprocesstimeline_weezeventmappings_jamais_rehydrate.md` — bug voisin, même
  wizard d'intégration Weezevent, cause différente (mappings jamais réhydratés au montage).
