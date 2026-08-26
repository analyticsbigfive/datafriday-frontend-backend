# BUG-371-02 — La règle de frontière "voisin qui finit le jour où l'event commence" tronquait à tort deux events du même jour appartenant à des intégrations différentes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Critique (agrégation silencieusement vide ou tronquée à quelques minutes)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend (utilitaire partagé écriture + lecture)
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en constatant que `SFP-Cardiff` restait
  "Non agrégé" après plusieurs "Agréger" propres (jobs `completed`, sans coupure réseau cette
  fois), alors qu'une requête SQL directe montrait 4267 transactions / ~67 000 € HT bien réelles
  pour SFP ce jour-là.
- **Fichiers** :
  - `backend/src/shared/utils/event-window.util.ts` (`resolveEventTransactionWindow`)
  - `backend/src/features/aggregation/aggregation.service.ts` (select `allSpaceEvents`)

## Contexte

`resolveEventTransactionWindow` (fiche 147-01, partagée entre l'agrégation ET `resolveEventSalesScope`)
implémente une règle de frontière : si un "voisin" (autre event du space) FINIT le jour où CET
event COMMENCE, la fenêtre de cet event démarre à la fin déclarée du voisin plutôt qu'à minuit —
pensée pour le cas d'un event qui déborde après minuit sur le jour d'un autre (slide Bertrand :
PFC-RC Lens 14/02 fin 02h00 → SFP-Toulouse démarre le 15/02 à 02h00), et testée/voulue aussi pour
deux events du MÊME jour sans lien connu (BUG-339-02 : après-midi puis soirée, données non
séparables autrement que par le temps).

Le bug : la condition ne vérifiait que "le voisin finit le jour où je commence" — trivialement
vraie pour DEUX EVENTS BORNÉS AU MÊME JOUR (jour de fin du voisin == jour de début de l'event ==
le même unique jour), sans distinguer ce cas légitime (BUG-339-02, données non disambiguïsées)
du cas Jean Bouin : deux CLUBS DIFFÉRENTS (PFC et SFP), chacun avec son propre `Event.integrationId`
(BUG-368-02), jouant le même jour. Ici, `SFP-Cardiff` (fin 23h30) voyait son début poussé à 22h00
(fin de `PFC-Le Havre`, 23h00) — fenêtre réduite à 30 minutes au lieu de la journée complète,
alors que les ventes SFP couraient depuis 06h00 du matin. Résultat : agrégation "réussie" (job
`completed`) mais 0 ligne écrite, la fenêtre de 30 min ne couvrant quasiment aucune transaction.

## Fix

Ajout d'un garde : si l'event ET le voisin ont chacun leur PROPRE `integrationId` (non nul) et
qu'ils DIFFÈRENT, la règle de frontière ne s'applique pas entre eux — leurs transactions sont
déjà totalement séparées par `t.integrationId`, aucun découpage temporel n'est nécessaire. La
règle reste appliquée telle quelle quand l'un des deux (ou les deux) n'a pas d'`integrationId`
connu — le cas BUG-339-02 (CSV Digifood partagé, mode `range` legacy) continue de fonctionner à
l'identique.

`EventDayFields` (le type partagé du "voisin") étend avec `integrationId?: string | null` ;
`executeProcessEvents` ajoute ce champ au `select` de `allSpaceEvents` (le côté lecture,
`resolveEventSalesScope`, l'avait déjà).

Tests : nouveau fichier `event-window.util.spec.ts` (aucun test dédié n'existait avant pour cet
utilitaire — explique que ce bug soit passé inaperçu), reproduit le cas réel exact et verrouille
la non-régression du cas legacy BUG-339-02.

## Risque de régression / à surveiller

- Deux events de la MÊME intégration le même jour (même club, deux matchs le même jour — rare
  mais possible) restent séparés par le découpage temporel, comme avant : le garde ne s'active
  que si les `integrationId` DIFFÈRENT.
- Les données déjà écrites AVANT ce fix avec une fenêtre tronquée (agrégation "réussie" mais
  quasi vide) restent en base jusqu'à un nouveau "Relancer" sur l'event concerné.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) — introduit
  `Event.integrationId`, dont ce fix exploite la présence pour désactiver la règle de frontière.
- [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md) — trouvé le même
  jour sur le même cas réel (SFP-Cardiff/PFC-Le Havre) ; un bug réel mais distinct, insuffisant
  seul à expliquer le "0 résultat" persistant après un run propre.
