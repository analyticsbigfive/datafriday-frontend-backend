# BUG-358-02 — Conteneur "site" Digifood non détecté au démarrage d'une intégration (cold-start du seuil de span BUG-338-02)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business (step 4 et page Analyse entièrement vides pour toute
  nouvelle intégration Digifood — pas un cas rare, c'est l'état de TOUT tenant qui vient de brancher
  Digifood)
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-24 — signalé par KOUAME Ulrich : "step 4 est vide quand on fait
  l'aggregation" pour le tenant "Eat Is Family" / espace "La Beaujoire Nantes" (FC Nantes vs Rodez,
  22/08/2026)
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts:262-296`
  (`resolveSeasonContainerEventIds`) ; `backend/src/features/digifood/services/
  digifood-ingestion.service.ts:239-271` (`upsertSiteAsEvent`, §5.4
  `docs/old/PLAN_INTEGRATION_DIGIFOOD.md`)
- **Commit** : `8c59f07a` "Add handling for Digifood SalesEvents in event processing" (2026-08-24
  18:43 UTC)

## Symptôme

Tenant `cmrpf3ukw0001bdu2h6rz0vbz` ("Eat Is Family"), espace "La Beaujoire Nantes" — event
"Nantes-Rodez" (22/08/2026) : `SpaceRevenueMinuteAgg`/`ItemAgg` à 0 ligne malgré 4204 transactions
Digifood réelles synchronisées pour cette date (61 091,81 €). Step 4 du wizard et graph de la page
Analyse tous les deux vides. Steps 1 (mapping intégration↔space) et 2 (mapping location↔shop)
vérifiés complets — pas un défaut de mapping.

## Cause racine

`resolveSeasonContainerEventIds` (introduit par BUG-338-02, commit `8eb48264`, 2026-08-18) détecte
un `SalesEvent` "conteneur" (qui ne désigne pas un match précis) uniquement par le **span observé**
de ses transactions déjà synchronisées (> `MAX_EVENT_SPAN_DAYS` = 2 jours). Ce critère fonctionne
pour une saison Weezevent déjà riche d'historique au moment du sync (span > 2j immédiatement), mais
pas pour le conteneur "site" que `upsertSiteAsEvent` crée pour chaque intégration Digifood
(`digifood-ingestion.service.ts:239` — projette le SITE entier, permanent, jamais un match, avec
`startDate`/`endDate` volontairement absents, cf. §5.4 `PLAN_INTEGRATION_DIGIFOOD.md`) : pour une
intégration qui vient d'être branchée (1 seul match synchronisé), le span observé n'est que de
quelques heures — sous le seuil — donc PAS classé conteneur, donc traité comme un lien "exact"
protégé, donc exclu du repli par date (protection anti-double-comptage de BUG-328-02, appliquée à
tort ici). Résultat : 0 ligne écrite pour cet event, alors que les transactions existent.

Le vrai signal n'est pas "combien de jours de span déjà observés" (fragile, dépend du volume déjà
synchronisé — cold-start) mais "cet id peut-il structurellement désigner un match unique ?", et pour
Digifood la réponse est connue **à la création**, pas à déduire des données :
`upsertSiteAsEvent` tague déjà `metadata: { provider: 'digifood' }`.

## Correction

`resolveSeasonContainerEventIds` traite désormais tout `SalesEvent` avec `metadata.provider ===
'digifood'` comme conteneur **inconditionnellement**, en plus (union) de la détection par span pour
les conteneurs de saison Weezevent classiques. Se débloque immédiatement pour toute nouvelle
intégration Digifood, sans attendre un 2ᵉ match synchronisé.

Vérifié contre la base réelle : les 8 `SalesEvent` de type site Digifood existants (tenants
`cmrpf3ukw...`, `cmovsic1g...`, `cmpya1n2...` — adidas arena, La Beaujoire, Stade Marie Marvingt ×3)
sont bien tous couverts par la nouvelle clause `metadata: { path: ['provider'], equals: 'digifood'
}` (syntaxe déjà utilisée ailleurs dans le code, `logistics.service.ts:2646` et suivants).

## Risque de régression / à surveiller

- **Aucun test unitaire ajouté** pour cette clause spécifique (`aggregation.service.spec.ts` ne
  couvre pas le cas `metadata.provider === 'digifood'`) — à ajouter.
- Composé avec BUG-359-02 (fenêtre journée calendaire, même commit ultérieur `fb2bb604`) : une fois
  le conteneur reconnu, la fenêtre effective dépend aussi de ce second fix — les deux sont
  nécessaires ensemble pour que le CA affiché soit correct, pas seulement non-nul.
- `executeProcessEvents` n'a pas encore été relancé en conditions réelles sur Nantes-Rodez au moment
  de ce commit (vérifié uniquement par requête SQL équivalente en lecture seule) — à confirmer après
  un run réel que `SpaceRevenueMinuteAgg`/`ItemAgg` se peuplent comme attendu.

## Références

- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) — le mécanisme de
  détection de conteneur dont celui-ci corrige le cold-start.
- [BUG-359-02](359_02_digifood_deconsigne_signe_ecrase_math_abs.md) — bug distinct découvert dans la
  même investigation (signe des lignes déconsigne).
- [BUG-360-02](360_02_aggregation_fenetre_doorsopening_tronque_ventes_avant_match.md) — bug distinct
  découvert dans la même investigation (fenêtre `doorsOpening` trop étroite).
