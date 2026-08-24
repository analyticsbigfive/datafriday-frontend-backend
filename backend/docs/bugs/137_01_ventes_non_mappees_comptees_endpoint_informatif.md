# BUG-137-01 — Ventes non mappées : comptées, affichées « Non mappées », chiffrées par un endpoint dédié

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (lisibilité des chiffres + traçabilité d'une décision métier)
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : les deux — fiche miroir web **BUG-356-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/features/spaces/spaces.service.ts` (`getAnalyseUnmappedBatch`, `resolveEventSalesScope`), `src/features/spaces/spaces.controller.ts` (`GET :id/analyse-unmapped`)

## Symptôme

Pas un défaut de code : une **décision métier à documenter**, avec son aller-retour.

Séquence du 2026-08-24 (JLH) :
1. Règle énoncée : « on ne doit prendre en compte que les ventes mappées […] on ne prend en
   compte que les IDs, pas de ressemblance » → l'exclusion a été **implémentée** (filtres
   `wpm."menuItemId" IS NOT NULL` sur timeline + paniers, scope PdV strict).
2. Après mesure d'impact et explication, décision **finale** : les ventes non mappées
   **restent comptées**, affichées sous « Non mappées » — l'exclusion est **écartée**.
   Les filtres ont été retirés le jour même ; il n'en reste rien dans les requêtes.

Ce qui a motivé le retour : l'impact mesuré. Part des lignes sans mapping produit depuis
08/2025 — Adidas Arena **100 %** (4,09 M€ HT), Auxerre ×2 **100 %** (411 k€), Mans Test
Ulrich **100 %** (201 k€), Saint-Étienne **100 %** (171 k€) ; **0 ligne non mappée** sur
les 2 intégrations actives de l'espace Le Mans FC.

## Cause racine

Cause unique des ventes non mappées, **mesurée en base** : le produit Weezevent est importé
au catalogue (`WeezeventProduct`) mais n'a jamais été associé à un menu item à l'**étape 3
du wizard Data Integration** (`WeezeventProductMapping` absent). Sur 786 882 lignes non
mappées : **0** ligne à `productId` NULL — aucun défaut d'import, uniquement du mapping
jamais fait, concentré sur des intégrations entières.

Sans indicateur, un gros bucket « Non mappées » (ou un espace 100 % non mappé) se lit
comme un bug d'affichage — exactement le piège de BUG-300-01 « No data for this breakdown ».

## Correction

- **Aucun filtre de mapping dans les endpoints de lecture** — `getEventTimelineBatch` et
  `getTransactionBasketsBatch` renvoient toutes les ventes ; les lignes non mappées portent
  `menuItemId = null` et le front les affiche sous « Non mappées » (libellé renommé, fiche
  web BUG-356-01). Le scope PdV garde sa branche permissive historique (PdV non mappé →
  bucket « PdV non mappés », jamais jeté).
- **Nouvel endpoint informatif** `GET /spaces/:id/analyse-unmapped?eventIds=…`
  (`getAnalyseUnmappedBatch`) : par event, `unmappedLines`, `unmappedUnits`,
  `unmappedRevenueHt`, `unmappedProductLines`, `unmappedPosLines`. Mêmes fenêtres
  (`resolveEventSalesScope`, qui expose désormais `shopIds`), même scope d'intégration,
  mêmes prédicats (`status = 'V'`, `deletedAt IS NULL`) que les deux endpoints de la page.
  Les ventes mappées vers les shops d'un **autre** espace ne sont pas comptées (elles
  n'appartiennent pas à cet écran). Alimente le bandeau de la page.
- Tests : describe `getAnalyseUnmappedBatch` (zéros sans trous, prédicats, conversion
  numérique) ; le test « n'écarte JAMAIS les lignes non résolues » est **conservé et
  renforcé** (assert explicite qu'aucun `wpm."menuItemId" IS NOT NULL` n'apparaît dans les
  SQL de lecture) ; test timeline « renvoie aussi les produits non mappés ».
- `scripts/verify-event-analytics.ts` : cible = vérité brute (toutes ventes), colonne
  « dont mappées » en information, section « Non mappées » chiffrée.

## Risque de régression / à surveiller

- **Ne pas ré-introduire l'exclusion en pensant appliquer « la règle »** : la règle finale
  est « comptées + affichées Non mappées + volume chiffré ». Cette fiche est le témoin de
  l'aller-retour — vérifier ici avant de « corriger ».
- L'endpoint scanne `WeezeventTransaction` brute (comme les paniers) : une requête de plus
  par chargement de page, bornée par les fenêtres d'events. À surveiller en multi-events.
- La résorption du volume non mappé passe par l'étape 3 du wizard sur les intégrations
  listées ci-dessus — pas par du code.

## Références

- Fiche miroir web : **BUG-356-01**
  (`web/docs/bugs/356_01_bandeau_non_mappees_analyse.md`).
- Fiches liées : [BUG-135-01](135_01_transactions_count_compte_des_lignes.md),
  [BUG-136-01](136_01_scope_ventes_une_seule_integration.md) ; web BUG-353-01 (identité
  article = IDs du mapping, jamais la ressemblance de nom — acquis conservé quel que soit
  le sort des non mappées) ; web BUG-300-01 (le précédent « vide illisible »).

---

*JLH*
