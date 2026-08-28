# BUG-362-02 — "Créer et lier tout" ne déclenche jamais l'agrégation : Analyse reste vide tant que "Tout agréger" n'est pas cliqué séparément

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (symptôme utilisateur direct : "Analyse vide dès que je fais une data
  integration")
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web` (frontend)
- **Découvert le** : 2026-08-25 — KOUAME Ulrich : "les transactions et mapping doivent être ceux de
  data integration vs les pages qu'on vient de faire. Mais actuellement c'est cassé" / "Analyse vide
  dès que je fais une dataintegration"
- **Fichiers** : `frontend/src/components/integration/wizard/StepProcessTimeline.vue`
  (`bulkCreateEvents`, `handleAggregateAll`)

## Symptôme

Après avoir fait la Data Integration (steps 1-3) puis cliqué "Créer et lier tout" au step 4 pour
créer/lier les events, la page Analyse reste vide — aucune donnée dans `SpaceRevenueMinuteAgg`/
`ItemAgg`. Il faut cliquer un second bouton, séparé et non mis en avant, "Tout agréger", pour que
l'agrégation tourne réellement.

## Cause racine

Le wizard expose deux actions totalement indépendantes :
- **"Créer et lier tout"** (`bulkCreateEvents`) — crée les `Event` DataFriday et pose
  `Event.weezeventEventId` (BUG-331-02).
- **"Tout agréger"** (`handleAggregateAll` → `processEvents`) — lance le job qui peuple réellement
  `SpaceRevenueMinuteAgg`/`ItemAgg`, dont dépend la page Analyse.

Rien n'enchaîne la seconde après la première. Le seul déclenchement automatique existant
(`triggerLiveAggregation`, post-webhook, BUG-109) ne s'applique pas ici : pas de webhook pour un
import CSV Digifood, et de toute façon no-op tant que `Event.weezeventEventId` n'est pas posé — ce
qui vient tout juste d'être fait par `bulkCreateEvents` au moment où l'utilisateur regarde déjà
l'Analyse.

## Correction

`bulkCreateEvents` appelle désormais `this.handleAggregateAll()` (fire-and-forget, ne bloque pas la
fermeture du dialog "Créer et lier tout" — `handleAggregateAll` gère son propre état/snackbar) juste
après `loadTimeline`, dans les deux branches de sortie (patch seul, ou création + patch), dès qu'au
moins un event a été créé ou rattaché.

## Risque de régression / à surveiller

- `handleAggregateAll` opère sur `this.unprocessedEvents` (dérivé de `this.events`, rafraîchi par
  `loadTimeline` juste avant) — dépend donc que `loadTimeline` ait bien inclus les events tout
  juste créés/patchés avant l'appel ; pas vérifié en conditions réelles (pas de serveur de dev
  lancé pendant ce fix, cf. règle session "ne jamais démarrer le dev server").
- Lancer l'agrégation automatiquement à chaque "Créer et lier tout" augmente la fréquence des jobs
  BullMQ `AGGREGATION` — même remarque de dimensionnement que BUG-109 (queue avec retry, déjà
  vérifiée pour la charge webhook, à confirmer pour ce nouveau déclencheur).
- Aucun test unitaire/e2e ajouté (composant Vue, pas de suite Jest existante dessus).

## Références

- [BUG-109](../../../backend/docs/bugs/109_aggregation_jamais_declenchee_automatiquement.md) —
  même catégorie de gap (agrégation non déclenchée), déjà corrigée pour le chemin webhook ; ce
  ticket couvre le chemin wizard.
- [BUG-331-02](331_02_bulkcreateevents_ne_pose_jamais_event_weezeventeventid.md) — pose du lien
  dont dépend `triggerLiveAggregation`.
- [BUG-361-02](361_02_bulkcreateevents_conteneur_saison_cree_event_plusieurs_mois.md) — bug
  distinct corrigé dans le même passage (conteneurs de saison/site exclus de la création).
