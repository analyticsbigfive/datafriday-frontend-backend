# BUG-363-02 — `resolveSeasonContainerEventIds` : le cold-start touche aussi les intégrations Weezevent fraîches, pas seulement Digifood (BUG-358-02) — fix par span déclaré

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business (Analyse entièrement vide pour toute intégration
  Weezevent groupée par saison tout juste synchronisée)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en travaillant le step 4 : "prenons le cas de Mans
  sur big five orgs où toutes les données d'analyses sont vides"
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts:256-316`
  (`resolveSeasonContainerEventIds`)

## Symptôme

Tenant "Big Five Org" (`cmovsic1g01lvvwyndt2qqwkw`), space "Le Mans FC", event "Le Mans FC vs
Brest" (22/08/2026) : 6 runs d'agrégation "completed" (dernier 19:42:11) mais **0 ligne** dans
`SpaceRevenueMinuteAgg`, malgré 5802 transactions Weezevent réelles synchronisées pour cette date
(intégration "Le Mans FC Weez", branchée le jour même, 18:15).

## Cause racine

Même catégorie que BUG-358-02, sur une source différente. Les 5802 transactions sont toutes liées
(`t.eventId`) au `SalesEvent` "LE MANS FC - SAISON 26/27" — un conteneur de saison Weezevent
classique (BUG-338-02). `resolveSeasonContainerEventIds` ne le détecte QUE par le span **observé**
des transactions déjà synchronisées (> `MAX_EVENT_SPAN_DAYS` = 2 jours). Vérifié en base : span
observé = ~5h (22/08 16:29-21:24, un seul jour de sync jusqu'ici) — sous le seuil, donc pas détecté
comme conteneur, donc les transactions liées à cet id restent exclues du repli par date.

Le fix Digifood de BUG-358-02 (`metadata.provider === 'digifood'`) ne s'applique pas ici : c'est une
vraie intégration billetterie Weezevent, pas un site Digifood.

## Correction

Ajout d'un second signal, indépendant du span observé : le span **déclaré** du `SalesEvent`
(`startDate`/`endDate`, alimentés par `live_start`/`live_end` côté API Weezevent — la fenêtre live
réelle de l'event, pas la période de vente des billets). Vérifié en base : "LE MANS FC - SAISON
26/27" a un span déclaré de **290,9 jours** (2026-08-15 → 2027-06-02), cohérent avec un vrai
calendrier de saison Ligue 2 — pas un artefact étroit.

Les deux signaux (span observé, span déclaré) se combinent en **OU** : un span déclaré large suffit
à classer conteneur, sans attendre d'historique de transactions. Ça ne réintroduit pas le problème
inverse documenté en BUG-338-02 (span déclaré étroit/13h pour un vrai conteneur de 10 mois observés)
— ce cas reste couvert par le signal "span observé", inchangé. Un span déclaré large ne peut
qu'AJOUTER un conteneur détecté, jamais en retirer un déjà détecté par l'autre signal.

Test ajouté (`aggregation.service.spec.ts`) : `SalesEvent` au span déclaré large mais span observé
nul (cold start) → détecté conteneur, repli range au lieu du mode exact. Suite complète : 57/57
passent.

## Risque de régression / à surveiller

- Risque théorique inverse non observé à ce jour : un `SalesEvent` de VRAI match unique dont
  `startDate`/`endDate` (`live_start`/`live_end`) couvriraient à tort plus de 2 jours (ex. si
  Weezevent y encodait une fenêtre de vente plutôt que la fenêtre live) — classerait ce match à
  tort comme conteneur, le privant du rattachement exact. Pas de cas observé en base à ce jour ;
  à surveiller si des matchs individuels commencent à disparaître du mode exact après ce fix.
- Événement "Le Mans FC vs Brest" pas encore ré-agrégé après ce fix au moment du commit — à
  confirmer que `SpaceRevenueMinuteAgg` se peuple correctement une fois `processEvents` relancé.

## Références

- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) — signal span
  observé, dont celui-ci ajoute un second signal complémentaire.
- [BUG-358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md) — même catégorie de bug
  (cold-start de la détection de conteneur), pour Digifood plutôt que Weezevent.
- [BUG-361-02](361_02_bulkcreateevents_conteneur_saison_cree_event_plusieurs_mois.md) — la détection
  de conteneur (`isSeasonContainer`) que ce fix renforce est aussi celle qui protège désormais le
  step 4 contre la création d'un faux Event à partir d'un conteneur.
