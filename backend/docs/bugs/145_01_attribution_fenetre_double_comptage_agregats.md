# BUG-145-01 — Attribution par fenêtre horaire : 80 343 € comptés deux fois, CA des jours à double affiche faux

- **Statut** : diagnostiqué (2026-08-24, vérifié en base de production) — correctif = fiche 146-01
  (règle Bertrand du 25/08) + correctifs de données (SQL préparés, application manuelle)
- **Modules** : aggregation (attribution des ventes aux events), spaces (fenêtres Analyse), données
- **Fiches liées** : 142-01 (deux events même jour — même racine, désormais expliquée et chiffrée),
  146-01 (la règle décidée et son implémentation), frontend 364-01 · Réconciliation complète des
  77 events : artefact https://claude.ai/code/artifact/5ee261f8-61c7-434a-918e-aa9b2cb1e00d

## En clair

Le Stade Jean Bouin héberge deux clubs (Stade Français rugby, Paris FC foot). Certains jours,
les DEUX jouent à domicile. L'application attribue les ventes aux matchs uniquement par
l'horaire (« tout ce qui est vendu dans cette tranche appartient à ce match ») sans jamais
vérifier de quel club vient la caisse. Résultat, les jours à deux matchs : les ventes du
rugby sont comptées dans le match de foot ET dans le match de rugby — comptées deux fois.
Sur la saison, 80 343 € sont en double, et le match de foot féminin PFC-Dijon affiche
35 301 € alors que sa caisse réelle n'a encaissé que 1 975 €.

## Constat (tout vérifié en base le 24-25/08, lecture seule)

- **Cohérence interne parfaite** : `Event.revenue` = `SUM(SpaceRevenueMinuteAgg)` de l'espace
  au centime sur les 77 events ; la somme (2 926 565,31 €) = la carte d'accueil au centime.
  Le rollup n'est PAS périmé (`calculatedAt` du jour). Le problème n'est pas un bug de
  calcul entre les pages, c'est l'attribution en amont.
- **Deux seuls chevauchements d'attribution sur 54 events à CA** (plages d'agrégats qui se
  recouvrent, requête d'auto-jointure sur MIN/MAX minute) :
  - **06/09/2025** : PFC-Dijon (fem) 35 301,39 € / 2 158 tx (12:00-16:48 UTC) ⊂ SFP-Montauban
    89 182,24 € / 5 055 tx (09:09-16:48) → 35 301,39 € en double. Réel par tag conteneur
    Weezevent : Dijon 1 975,38 € / 248 tx (conteneur « PARIS FOOTBALL CLUB »), Montauban
    87 206,80 € / 4 807 tx (conteneur « STADE FRANÇAIS 25-26 »).
  - **06/12/2025** : PFC-Le Havre (fem) 45 041,68 € / 2 949 tx ⊂ SFP-Cardiff 67 442,89 € /
    4 336 tx → 45 041,68 € en double. Réel : Le Havre fem 478,49 € / 70 tx, Cardiff
    67 001,61 € / 4 267 tx.
  - Total en double : **80 343,07 €** → vrai total espace ≈ 2 846 222,24 €.
- **Erreur de saisie aggravante** : SFP-Montauban a `eventDate` 2025-09-20 mais
  `eventStartDate`/`eventEndDate` 2025-09-06 (match réellement joué le 06/09). L'agrégation
  (qui lit `eventStartDate ?? eventDate`) agrège le bon jour ; la page Analyse (qui lit
  `eventDate` seul) obtient une fenêtre 20/09 → 06/09 invalide → l'event affiche 0 € dans
  l'Analyse. Aucune validation `eventEndDate >= eventDate` n'existe (dto/service/tests
  vérifiés) — verrou ajouté au plan (étape 2.4).
- **Écart Analyse vs Library expliqué** : l'Analyse fenêtre minuit→fin sans tag → pour Dijon
  elle capte toute la journée des 2 clubs (89 182,18 €, reproduit au centime en SQL) ; la
  Library porte la tranche 12:00-16:48 (35 301,39 €). Les deux chiffres sont faux — le vrai
  est 1 975,38 €.
- **Lignes orphelines** : les agrégats de l'event Dijon existent aussi sous 2 espaces
  SUPPRIMÉS (anciens espaces par club) pour 87 206,83 € et 1 975,41 € — exactement les deux
  conteneurs : l'ancienne organisation par club séparait correctement. Ces lignes sont
  filtrées par `spaceId` partout (aucun impact utilisateur) mais doublent la table → purge
  SQL préparée.

## Cause racine

L'attribution des ventes aux events se fait par fenêtre horaire à tous les étages
(`aggregation.service.ts` modes 2-4 ; `spaces.service.ts` `resolveEventSalesScope`), alors
que Weezevent fournit un tag conteneur fiable par club (`WeezeventTransaction.eventId` →
« STADE FRANÇAIS 25-26 » / « PARIS FOOTBALL CLUB », chacun portant son `integrationId`).
Le tag n'est utilisé nulle part pour attribuer — seulement pour élargir le filtre
(`eventLinkClause` : les tx taguées conteneur restent éligibles à la fenêtre de N'IMPORTE
quel event).

## Correctif

- **Règle métier décidée par Bertrand le 25/08** et implémentation : fiche **146-01**.
- **Correctifs de données** (SQL dans `backend/prisma/migrations/`, application manuelle,
  marche à suivre dans `INSTRUCTIONS_BACKEND_2026-08-25.md`) :
  1. dates SFP-Montauban → 06/09/2025 ;
  2. backfill lien event ↔ conteneur de club (les 77 events) ;
  3. purge des agrégats orphelins (espaces supprimés).

## Recette (après application + ré-agrégation)

Re-lancer la requête de chevauchement (dans `INSTRUCTIONS_BACKEND_2026-08-25.md`) : zéro
paire d'events aux plages qui se recouvrent ; Dijon ≈ 1 975 €, Montauban ≈ 87 207 €,
Le Havre fem ≈ 478 €, Cardiff ≈ 67 002 € ; somme Library = carte accueil = total sans doublon.

JLH
