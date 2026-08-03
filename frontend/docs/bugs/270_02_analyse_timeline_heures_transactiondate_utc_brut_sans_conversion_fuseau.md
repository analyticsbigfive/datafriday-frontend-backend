# BUG-270-02 — Timeline Analyse : heures affichées en UTC brut, sans conversion vers le fuseau de l'espace

- **Statut** : ⚪ Diagnostiqué — correctif proposé sur la branche
  `fix/bug-270-analyse-timeline-timezone` (retiré de `develop`, domaine Analyse hors périmètre
  de cette session, propriétaire produit Jean-Luc). À revoir/merger sous son arbitrage.
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend, seul repo touché)
- **Découvert le** : 2026-08-02 (signalé par l'utilisateur : "les heures sur la timeline
  d'analyse ne semblent pas correspondre aux heures de l'événement, ~2h de décalage, comme si on
  se calait sur l'heure d'Abidjan au lieu de l'heure indiquée/de l'utilisateur")
- **Fichiers** : `src/features/spaces/spaces.service.ts` — `getEventTimelineBatch`,
  `getTransactionBasketsBatch`, `resolveEventSalesScope` (correctif retiré, voir "Correction"
  ci-dessous — la cause racine et le diagnostic restent valides, seul le code a été annulé)

## Symptôme

Sur l'écran Analyse (`/spaces/:id`), la timeline minute par minute d'un événement affichait des
heures décalées d'environ 2h par rapport aux heures réelles de l'événement (portes, coup d'envoi,
transactions). Le diagnostic initial de l'utilisateur ("on dirait qu'on est calé sur l'heure
d'Abidjan, UTC+0") était juste : c'est exactement ce qui se passait, mais par absence de
traitement plutôt que par un fuseau codé en dur sur Abidjan.

## Cause racine

Vérifié empiriquement en base (comparaison `WeezeventTransaction."transactionDate"` vs
`WeezeventTransaction."rawData"->>'created'`, ce dernier suffixé `Z` donc UTC explicite) : les
deux valeurs sont identiques au chiffre près. La colonne `transactionDate` (type Postgres
`TIMESTAMP` **sans** fuseau) contient donc bien du vrai UTC, correctement ingéré — **la source du
bug n'est pas l'ingestion**.

Le bug est dans la lecture : `TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI')`
imprimait les chiffres UTC bruts tels quels, sans aucune conversion vers le fuseau réel de
l'espace/du lieu de l'événement. `t."transactionDate"` étant un `timestamp without time zone`,
`TO_CHAR`/`DATE_TRUNC` ne font *aucune* conversion implicite — ils affichent la valeur littérale
stockée.

Numériquement, UTC brut est indiscernable de l'heure d'Abidjan (UTC+0) — d'où l'impression exacte
décrite par l'utilisateur. Mais la quasi-totalité des espaces réels en base ont
`Space.timezone = 'Europe/Paris'` (vérifié : Auxerre, Nantes, St Étienne, Stade Français, Aix
Arena, "Big five"… tous à `'Europe/Paris'`, valeur par défaut du schéma jamais modifiée par une UI
dédiée — aucun écran ne permet de la changer). En été (CEST, UTC+2), afficher du UTC brut au lieu
de l'heure de Paris décale l'affichage de -2h par rapport à l'heure murale réelle du lieu — le
décalage rapporté.

`Space.timezone` existait déjà en base (colonne avec défaut `'Europe/Paris'`, schema.prisma) mais
n'était lu par **aucune** requête de lecture de la timeline — champ silencieusement inutilisé pour
cet usage.

## Correction

**⚠️ Écrite, vérifiée en base, puis retirée de `develop` le 2026-08-02** — le domaine Analyse est
hors du périmètre confié pour cette session (propriétaire produit : Jean-Luc). Conservée ici
telle quelle à titre de proposition, pour éviter de refaire le diagnostic ; à réappliquer
seulement après validation de Jean-Luc, pour éviter un conflit avec un travail en cours de son
côté sur ce même fichier/domaine.

`resolveEventSalesScope` (source commune à `getEventTimelineBatch` et
`getTransactionBasketsBatch`) résout désormais aussi `Space.timezone` (repli `'Europe/Paris'` si
`null`, cohérent avec le défaut du schéma) et le renvoie dans son objet de scope. Les deux requêtes
SQL brutes remplacent `DATE_TRUNC('minute', t."transactionDate")` par
`DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone})` — à
la fois dans le `SELECT`/`TO_CHAR` et dans le `GROUP BY` correspondant (les deux doivent rester
identiques pour que Postgres accepte le regroupement). `AT TIME ZONE 'UTC'` réinterprète la valeur
naïve comme un instant UTC réel (→ `timestamptz`), puis `AT TIME ZONE ${spaceTimezone}` la
reprojette en heure murale locale de l'espace. Vérifié directement en base (`psql`) que
l'expression produit le résultat attendu (ex. `09:28 UTC` → `11:28` en `Europe/Paris` en août,
CEST).

Aucun changement d'ingestion : `transactionDate` reste stocké tel quel (vrai UTC, confirmé
correct).

## Risque de régression / à surveiller

- **Code actuellement absent de `develop`** (revert manuel du fichier à son état d'avant le commit
  `8ff711ec`, qui reste consultable pour retrouver le diff exact du correctif proposé). Ce commit
  contenait aussi BUG-271/BUG-272 (conservés, non affectés — fichiers distincts).
- Espaces réellement situés hors `Europe/Paris` (ex. Abidjan) : `Space.timezone` reste à
  `'Europe/Paris'` par défaut faute d'UI pour la changer — **aucun écran ne permet aujourd'hui de
  configurer le fuseau d'un espace**. Un espace véritablement en Côte d'Ivoire afficherait
  désormais un décalage de +2h en été là où il n'y en avait pas avant (avant le fix, un espace
  Abidjan-là affichait "correctement" par coïncidence, l'UTC brut). Zone grise à trancher : soit
  exposer `timezone` dans l'UI de gestion d'espace, soit documenter que tous les espaces gérés à
  ce jour sont bien en France métropolitaine (vérifié en base au 2026-08-02 : tous les espaces
  listés sont des clubs/salles françaises).
- `getEventMinuteChart`/`getEventBreakdown`/`getEventStats` (`aggregation.service.ts`, pipeline du
  wizard Data Integration étape 4/5, table `SpaceRevenueMinuteAgg`) **n'ont pas été touchés** —
  chemin de lecture différent (colonne `TIMESTAMPTZ`, pas `TIMESTAMP`), écran différent
  (`StepProcessTimeline.vue`, pas Analyse). Si le même symptôme (heures décalées) est confirmé sur
  cet écran, il faudra un audit et un correctif séparés — non couvert ici, hors du périmètre
  signalé ("timeline d'analyse").
- Tests unitaires `spaces.service.spec.ts` (`getEventTimelineBatch`, `getTransactionBasketsBatch`)
  repassent inchangés (mock `prisma.space.findFirst` déjà en place, réutilisé pour la nouvelle
  requête de fuseau).

## Références

- [`docs/modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — domaine Analyse & agrégation,
  section "Bugs actifs confirmés" (entrée #11 ajoutée).
