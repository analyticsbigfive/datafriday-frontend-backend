# BUG-338-02 — Régression du 2026-08-18 (commit 23cd32c9) : le fix BUG-328/329/330-02 vide l'agrégation des tenants dont Weezevent groupe la billetterie par SAISON plutôt que par match (Stade Jean Bouin, PFC/SFP)

- **Statut** : 🟡 Corrigé non testé en prod (2026-08-18) — root cause confirmée par archéologie
  git + données réelles, fix implémenté et vérifié empiriquement (requête équivalente rejouée
  contre la base réelle, voir "Vérification"), mais `executeProcessEvents` pas encore relancé en
  conditions réelles pour écrire les lignes dans `SpaceRevenueMinuteAgg`
- **Sévérité** : 🔴 Bloquant/impact business (tenant client réel "Eat Is Family" — Stade Jean
  Bouin entièrement vide ; **Aix Arena et AJ Auxerre également exposés**, protégés seulement par
  le fait que personne n'a relancé "Tout agréger" pour eux depuis le commit de régression, voir
  "Portée du bug")
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-18 — Ulrich signale "après re-synchronisation des 2 Data
  Integration de PFC et SFP je n'ai toujours rien sur le Stade Jean Bouin", puis pousse
  explicitement sur la cause ("le bug doit venir de nous") — diagnostic initial (incompatibilité
  structurelle "produit") corrigé après vérification de l'historique git.
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts:237-307` (`resolveEventWindow`,
    introduit par le commit `23cd32c9`)
  - Commit `23cd32c9` (2026-08-18 11:20 UTC, KOUAME Ulrich, "fix(aggregation): rattachement
    transaction-event exact + fenêtre par heure réelle") — merge de la branche
    `fix/event-aggregation-window-precision` (ouverte le 2026-08-14) dans `develop`
  - [BUG-328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md),
    [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) —
    le fix originel dont celui-ci est un effet de bord

## Symptôme

Tenant `cmrpf3ukw0001bdu2h6rz0vbz` ("Eat Is Family"), espace "Stade Jean Bouin"
(`cmsufah9p0c08gpkz2wsg5pzo`), intégrations Weezevent PFC (`cms82c09u8tdhkgsmovyrzzlk`) et SFP
(`cms9h9tfy00blqdroy0ahs1rd`) : `SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg` (tables qui
alimentent Analyse/Event Predict) ont **0 ligne** pour cet espace, alors que :
- Les données brutes existent en quantité : 80 913 transactions (PFC) + 120 897 (SFP), toutes
  liées à un `WeezeventEvent` (`eventId` non-null à 100%, vérifié).
- Le mapping est complet et correct : étape 1 (2 `LocationSpaceMapping`) ✓, étape 2 (112
  `LocationShopMapping`) ✓.
- D'autres espaces du même tenant (Aix Arena, Auxerre, Le Mans FC) ont des dizaines de milliers de
  lignes dans ces mêmes tables — l'agrégation fonctionne ailleurs sur ce tenant.

Re-synchroniser PFC/SFP ne change rien — pas un défaut de synchronisation.

## Cause racine — RÉGRESSION confirmée, pas une limitation structurelle

**Premier diagnostic (incorrect, corrigé ci-dessous)** : j'avais d'abord conclu à une
incompatibilité produit entre la granularité Weezevent (Stade Jean Bouin vend par SAISON — un seul
`WeezeventEvent`/`SalesEvent`, ex. "STADE FRANÇAIS 25-26", `event_id` Weezevent brut `'7'`,
120 395 transactions, du 2025-09-03 au 2026-07-07) et la granularité DataFriday (75 `Event`, un
par match). Cette lecture de la donnée était juste, mais la conclusion ("c'est structurel, pas un
bug") était fausse — vérifié en remontant l'historique git sur demande d'Ulrich.

**Avant le commit `23cd32c9` (2026-08-18 11:20 UTC)**, `executeProcessEvents` rattachait les
transactions à un `Event` **uniquement par plage de date** (`t."transactionDate" >= eventDate AND
< nextDay`), sans jamais regarder `WeezeventTransaction.eventId`. Ce comportement, bien
qu'imparfait (BUG-328-02 : deux events aux fenêtres qui se recoupent comptaient deux fois les
mêmes transactions), avait un effet de bord positif pour Stade Jean Bouin : peu importe que
`t.eventId` pointe vers l'event-saison Weezevent, chaque transaction garde sa propre
`transactionDate` réelle (jour d'achat/scan) — le rattachement par date pouvait donc correctement
répartir les transactions entre les 75 matchs.

**Le commit `23cd32c9`** (fusion aujourd'hui de la branche `fix/event-aggregation-window-precision`,
ouverte le 14) corrige BUG-328/329/330-02 en introduisant `resolveEventWindow()` : rattachement
EXACT par `t.eventId = Event.weezeventEventId` quand ce lien existe, sinon repli par date mais
**restreint aux transactions `t."eventId" IS NULL`** — l'intention (légitime, cf. BUG-330-02) est
d'éviter qu'une transaction déjà rattachée avec certitude à un event ne soit *aussi* comptée dans
la fenêtre de repli d'un autre. Le raisonnement sous-jacent, écrit noir sur blanc dans BUG-330-02 :
*"[eventId] garantit qu'une transaction n'appartient qu'à un seul event — l'ambiguïté de
chevauchement ne devrait pas exister pour les transactions qui la portent."*

**C'est cette hypothèse qui casse pour Stade Jean Bouin** : elle suppose implicitement qu'"un
event Weezevent" ≈ "un match/Event DataFriday" (1↔1). Ici c'est faux (N matchs ↔ 1 event-saison) —
`t.eventId` est bien renseigné pour 100 % des transactions (donc "n'appartient qu'à un seul event"
est techniquement vrai), mais cet unique event est l'event-SAISON, pas un match précis. Le repli
exclut alors **toutes** les transactions (elles ont toutes un `eventId`), pour les 74 matchs qui
n'ont pas de lien exact — même celles dont la date tombe exactement le jour du match. Seul 1/75
match (`PFC-Nice`, coïncidence de date via l'auto-link BUG-021) passe par le mode exact.

**Résultat vérifié** : `resolveEventWindow` en mode `range` filtre `t."eventId" IS NULL` ; **0 des
201 810 transactions PFC/SFP n'ont `eventId IS NULL`** (100 % déjà liées à leur event-saison) → le
repli ne matche jamais rien pour ce tenant, depuis la fusion de `23cd32c9` aujourd'hui.

## Portée du bug — pas isolé à Stade Jean Bouin

Vérifié sur les intégrations `SalesEvent`/transactions réelles des 3 autres espaces du même
tenant, avant correction :
- **AJ Auxerre** : les vrais matchs ("[Simulé] 8 A B C D — 2026-08-06", etc.) ont un span
  transactionnel de 0,3 à 1 jour — sains. Mais **"AJ AUXERRE - Saison 25/26"** (63 225
  transactions) et **"...26/27"** sont bien des conteneurs (368 et 14 jours de span).
- **Aix Arena** : **100 % des 65 416 transactions** sont liées à un seul `SalesEvent`
  ("ARENA AIX", 293 jours de span) — même situation que Stade Jean Bouin.

Aix Arena/AJ Auxerre affichent encore des données dans `SpaceRevenueMinuteAgg` aujourd'hui
**uniquement parce que personne n'a relancé "Tout agréger" pour eux depuis la fusion de
`23cd32c9` ce matin** — ces lignes sont l'ancien calcul (pré-régression), pas rafraîchies. Le
prochain "Tout agréger"/webhook de live-aggregation sur ces espaces les viderait exactement comme
Stade Jean Bouin, sans ce fix.

## Correction implémentée et vérifiée

Le vrai problème n'est pas "transaction déjà liée à UN event" mais "transaction déjà liée à un
event-CONTENEUR (dont les transactions réellement observées s'étalent sur plus de 2 jours)".
Nouvelle méthode `resolveSeasonContainerEventIds(tenantId, integrationId)`
(`aggregation.service.ts`) : `GROUP BY t."eventId"`, `MIN`/`MAX(transactionDate)` réels, flag si
span `> MAX_EVENT_SPAN_DAYS` (= 2, même seuil que `resolveEventSalesScope`,
`spaces.service.ts`, fix du 2026-08-04 sur le même symptôme "conteneur de saison" ailleurs dans
le code). Calculée UNE fois par run (pas par event), utilisée à deux endroits :
1. `resolveEventWindow` : un `event.weezeventEventId` qui pointe vers un conteneur n'est **plus**
   traité comme un lien exact — retombe sur le repli par date (comme un event non lié).
2. `matchClause` (mode `range`) : `t."eventId" IS NULL OR t."eventId" IN (<conteneurs>)` au lieu
   de `t."eventId" IS NULL` seul — une transaction liée à un conteneur reste éligible au repli par
   date, exactement comme avant `23cd32c9`.

**Important, découvert en creusant** : contrairement au fix du 04/08
(`resolveEventSalesScope`, qui détecte un conteneur via les dates DÉCLARÉES de l'`Event`
DataFriday, `eventDate`/`eventEndDate`), ce fix-ci détecte un conteneur via les dates RÉELLEMENT
OBSERVÉES sur ses transactions — pas via les dates déclarées du `SalesEvent`
(`startDate`/`endDate`, alimentées par `live_start`/`live_end` côté Weezevent). Vérifié sur
"STADE FRANÇAIS 25-26" : `live_start`/`live_end` Weezevent donnent une fenêtre de **13 heures**
alors que ses transactions couvrent **10 mois** — un simple report du mécanisme du 04/08 (basé
sur les dates déclarées) n'aurait PAS détecté ce conteneur.

## Vérification

Requête équivalente au nouveau `matchClause`, rejouée contre la base réelle pour le match
"SFP-Bayonne" (eventDate 2026-05-30), tenant `cmrpf3ukw0001bdu2h6rz0vbz` :
```
AVANT (eventId IS NULL uniquement)      : 0 transaction, 0 €
APRÈS (+ conteneur de saison autorisé)  : 6 224 transactions, 83 146,91 €
```
Détection des conteneurs vérifiée exhaustivement sur PFC/SFP/AJ Auxerre/Aix Arena (span calculé
pour chaque `eventId` réellement lié, comparé au flag attendu) — 0 faux positif observé sur les
événements réels (matchs simulés AJ Auxerre : 0,3-1 jour, tous correctement NON classés
conteneurs) et 0 faux négatif sur les conteneurs connus.

**Pas encore fait** : `executeProcessEvents`/`executeSynchronize` n'a pas été relancé en
conditions réelles (via le job BullMQ complet) pour écrire dans `SpaceRevenueMinuteAgg` —
seule la requête SQL équivalente a été rejouée en lecture seule. `tsc --noEmit` propre.
`npx prisma migrate deploy`/backfill non applicable ici (aucun schéma touché).

## Risque de régression / à surveiller

- Le fix proposé ne doit PAS réintroduire le double comptage de BUG-328-02 pour les tenants
  "1 event Weezevent = 1 match" qui fonctionnent déjà (Aix Arena, Auxerre, Le Mans FC, même
  tenant) — à vérifier après implémentation.
- Toute future intégration avec billetterie "saison"/pass reproduira ce même symptôme tant que ce
  fix n'est pas fait — pas isolé à Stade Jean Bouin.
- Aucune donnée n'a été perdue : `SpaceRevenueMinuteAgg`/`ItemAgg` sont recalculables à volonté
  (delete + recompute par event) depuis les transactions brutes, intactes.

## Références

- [BUG-328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md) — le problème
  que `23cd32c9` corrige légitimement (chevauchement de fenêtres, double comptage).
- [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) —
  l'hypothèse 1 event Weezevent ↔ 1 Event DataFriday, fausse pour ce tenant, à l'origine de la
  régression.
- [BUG-329-02](329_02_aucune_heure_capturee_evenement_buffer_pre_ouverture.md) — même commit,
  fenêtre horaire réelle (non concerné par cette régression).
