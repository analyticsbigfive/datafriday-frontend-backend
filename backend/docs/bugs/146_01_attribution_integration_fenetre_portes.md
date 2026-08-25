# BUG-146-01 — Règle d'attribution Bertrand (25/08) : data integration + fenêtre « portes → fin »

- **Statut** : corrigé côté code (2026-08-25) — non testé ; en attente des SQL (backfill lien club,
  dates Montauban) appliqués par la personne backend + ré-agrégation (marche à suivre :
  `INSTRUCTIONS_BACKEND_2026-08-25.md`). Règle validée le 25/08 (mail Bertrand + slide).
- **Modules** : aggregation (attribution), spaces (fenêtres Analyse), frontend Analyse (source KPI)
- **Fiches liées** : 145-01 (le constat chiffré qui a motivé la question), 142-01 (premier
  signalement du symptôme), frontend 364-01 · Question Bertrand consignée dans
  `frontend/docs/QUESTIONS_A_BERTRAND.md` (Q65, tranchée)

## En clair

Bertrand a tranché : une vente compte pour un match si elle vient de **la caisse du bon
club** (la data integration) ET si elle a lieu **entre l'ouverture des portes et l'heure de
fin** du match — y compris après minuit (sa slide : PFC-RC Lens du 14/02, portes 19h00 →
fin 02h00 le 15/02 ; SFP-Toulouse, portes 19h00 le 15/02 → fin 03h00 le 16/02). Aujourd'hui
l'application ne fait que la moitié horaire, et seulement dans le calcul de fond : personne
ne vérifie le club. On ajoute donc la vérification du club partout, et on aligne la page
Analyse sur la même fenêtre. Pour les sources sans tag de club (import CSV Digifood), la
fenêtre horaire seule reste le filet de sécurité — c'est le « garder la logique de la
présentation » du mail.

## La règle (référence : slide + mail du 25/08)

Transaction rattachée à l'event E ⟺
1. elle provient de l'intégration du club de E (tag conteneur Weezevent) ;
2. `transactionDate` ∈ [ouverture des portes, heure de fin] de E (minuit franchi autorisé).
Repli pour les sources sans tag (CSV Digifood) : critère 2 seul.
Ventes hors critères : NON rattachées — affichées comme telles, jamais fondues dans le CA.

## État du code au 25/08 (vérifié)

| Volet | Agrégation (`aggregation.service.ts`) | Page Analyse (`spaces.service.ts`) |
|---|---|---|
| Fenêtre portes→fin | ✅ mode `range` (l.331-342, BUG-329-02) : `doorsOpening` −2 h → `eventEndTime` +2 h. Vérifié en prod (Dijon : portes 16:00 → 1ʳᵉ minute agrégée 14:00 locale, pile) | ❌ minuit→fin + règle voisinage BUG-339-02 (l.1311-1351) |
| Vérification du club | ❌ le mode exact (l.324-326) exige un lien vers un match précis — 1 event sur 77 l'a ; `eventLinkClause` (l.444-450) laisse toute tx taguée conteneur entrer dans la fenêtre de n'importe quel event | ❌ aucun filtre par tag |
| Champ date lu | `eventStartDate ?? eventDate` (l.328) | `eventDate` seul (l.1315) — divergence révélée par Montauban |

Leviers vérifiés en base : chaque conteneur de club porte son `integrationId` (« STADE
FRANÇAIS 25-26 » → intégration SFP ; « PARIS FOOTBALL CLUB » → intégration PFC) ; les
77 events Jean Bouin ont tous `sessions[0].doorsOpening` renseigné.

## Implémentation (plan `dynamic-squishing-moon`, étape 6)

1. **Agrégation — nouveau mode `container-range`** : quand `Event.weezeventEventId` pointe un
   conteneur de saison (cas aujourd'hui rétrogradé en fenêtre seule, l.324),
   `matchClause = t."eventId" = <conteneur> AND transactionDate ∈ [start, end]` avec
   start/end = la fenêtre portes→fin existante. Le mode exact (match précis) et le repli
   fenêtre seule (aucun lien — CSV) ne bougent pas.
2. **Backfill du lien club** : `Event.weezeventEventId` = conteneur du club pour les 77
   events (SQL préparé — affectation par nom : SFP*/Dragons → conteneur Stade Français,
   PFC* → conteneur Paris FC ; ambigus type « STREAM FOR HUMANITY » listés pour arbitrage
   JLH). Aucune migration de schéma.
3. **Analyse alignée** (`resolveEventSalesScope`) : fenêtre portes→fin (réutiliser
   `combineDayAndLocalTime` + `sessions[0].doorsOpening`, lire `eventStartDate ?? eventDate`
   comme l'agrégation) + filtre conteneur par event quand le lien est posé. La règle de
   voisinage BUG-339-02 devient un filet pour les events sans heure de portes.
4. **KPIs Analyse ← `Event.revenue`** (réponse `/events` déjà chargée) → Analyse = Events
   Library = Accueil par construction ; indicateur « X ventes non rattachées » à part.
5. **Tests** (`aggregation.service.spec.ts`) : double affiche du 06/09 simulée (deux events,
   deux conteneurs, fenêtres qui se recouvrent → chacun ses ventes), CSV sans tag → fenêtre
   seule, event sans lien ni portes → comportement actuel conservé.

## Décisions / questions résiduelles (non bloquantes)

- **Marges −2 h/+2 h** : la slide dit portes→fin sec ; le code actuel ajoute les marges du
  staffing (`DEFAULT_OFFSET_OPEN/CLOSE_MINUTES`). Conservées en l'état pour ne pas exclure
  l'avant-match — à confirmer avec Bertrand.
- Les ventes d'un club un jour SANS match de ce club (ex. rugby vendu un jour de match de
  foot seul) restent non rattachées — c'est voulu, elles alimentent l'indicateur.

## Recette

1. Ré-agrégation Jean Bouin après backfill : Dijon ≈ 1 975 €, Montauban ≈ 87 207 €,
   Le Havre fem ≈ 478 €, Cardiff ≈ 67 002 € (chiffres vérifiés en base, fiche 145-01).
2. Zéro chevauchement de plages d'agrégats entre events (requête fournie dans
   `INSTRUCTIONS_BACKEND_2026-08-25.md`).
3. Tooltip Analyse d'un event = ligne Events Library au centime ; total Analyse sans filtre
   = carte accueil.
4. Import CSV Digifood : comportement inchangé (fenêtre seule).

JLH
