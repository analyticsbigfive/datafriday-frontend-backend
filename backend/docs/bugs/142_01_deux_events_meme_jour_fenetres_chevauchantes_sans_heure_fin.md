# BUG-142-01 — Deux events le même jour au même stade : données du mauvais match quand l'heure de fin manque

- **Statut** : ⚪ Diagnostiqué (mécanisme identifié ; cas prod du 06/09 à vérifier — events absents de la base dev)
- **Sévérité** : 🔴 Bloquant/impact business (analyses erronées, mauvais match affiché)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend) + saisie de données
- **Découvert le** : 2026-08-24 (réunion — 6 septembre, l'UI affiche SFP Montauban au lieu de PFC Dior, Stade Jean Bouin)
- **Fichiers** : `src/features/spaces/spaces.service.ts` (`resolveEventSalesScope`, construction
  des fenêtres — `preciseEndOf`, exclusion voisin), `src/features/aggregation/aggregation.service.ts`
  (`resolveEventWindow`, même logique côté writer)

## En clair

Quand deux matchs ont lieu le même jour dans le même stade, le système sait déjà les départager —
mais seulement si chacun a une heure de fin renseignée (ou l'heure de sa dernière session). La
fenêtre de ventes d'un match va de minuit à son heure de fin ; le match du soir démarre là où
celui de l'après-midi se termine. Si l'un des deux n'a ni heure de fin ni session, sa fenêtre
retombe sur le jour calendaire ENTIER : les deux fenêtres se recouvrent totalement et chaque
match absorbe les ventes de l'autre. Le fix probable n'est pas du code : renseigner les heures
des deux events du 06/09 — puis re-agréger.

## Symptôme

06/09 (prod) : l'UI Analyse affiche les données de SFP Montauban à la place de PFC Dior (deux
events le même jour, Stade Jean Bouin).

## Cause racine (diagnostic, à confirmer sur la prod)

`resolveEventSalesScope` (et `resolveEventWindow` côté agrégation) construit la fenêtre :

- fin = `preciseEndOf(event)` = `eventEndTime` (sinon `showTime` de la dernière session),
  combiné au jour via `combineDayAndLocalTime` — **repli jour entier +1 si aucune heure** ;
- début = minuit, avancé à l'heure de fin du voisin qui se termine ce jour-là (règle métier
  2026-08-19, BUG-339-02) — **le voisin sans heure de fin ne produit aucune exclusion**
  (`if (!neighborEnd) continue`), et un voisin dont la fin dépasse la fin de l'event courant est
  ignoré (garde anti-vidage mutuel).

Deux events le même jour avec heures complètes → fenêtres disjointes (00:00→fin A ; fin A→fin B),
comportement correct déjà en place. Dès qu'UN des deux n'a pas d'heure exploitable → repli jour
entier → recouvrement total → attribution croisée. Événements du 06/09 absents de la base dev
(vérifié : seuls XG/Adidas Arena le 05/09, SFP-Perpignan/Jean Bouin le 05/09,
Nantes-Nancy le 07/09) — la vérification doit se faire sur la prod.

## Correction (à faire)

1. **Vérifier sur la prod** (SQL read-only) : `eventEndTime`, `sessions` (doorsOpening/showTime)
   des deux events du 06/09 au Stade Jean Bouin. Attendu : au moins un des deux à NULL/vide.
2. **Données** : renseigner `showTime`/`eventEndTime` des deux events (Settings/Profile de
   l'event), puis re-agréger (`POST /aggregation/process-events`).
3. **Durcissement code (optionnel, à valider JLH)** : quand DEUX events partagent le même jour et
   qu'au moins un n'a pas d'heure de fin, logguer un warn explicite (aujourd'hui le recouvrement
   est silencieux) — voire refuser le repli jour entier dans ce cas précis et exiger la saisie.
   Ne rien changer au cas mono-event (repli jour entier légitime).
4. Vérifier aussi que la prod exécute bien le code BUG-339-02 (fiche marquée non déployée à sa
   création) — sans lui, même avec les heures saisies, les fenêtres restent au jour entier.

## Risque de régression / à surveiller

La garde « voisin dont la fin ≥ la mienne est ignoré » est porteuse (anti-vidage mutuel) — toute
modification doit conserver le test de BUG-339-02 (PFC - RC Lens / SFP-Toulouse).

— JLH
