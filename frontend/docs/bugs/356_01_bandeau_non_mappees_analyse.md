# BUG-356-01 — Bandeau « Non mappées » sur l'Analyse + libellé du bucket sentinelle

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (lisibilité — un bucket muet se lit comme un bug)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux — fiche miroir api **BUG-137-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/composables/useAnalyseUnmapped.js` (nouveau), `src/api/endpoints/space.api.js` (`getSpaceAnalyseUnmappedBatch`), `src/components/analyse/AnalyseView.vue` (indicateur du bandeau rouge), `src/i18n/translations.js` (`anUnmappedInfo`, `anUnmatchedItems`, `anUnmatchedShops`)

## Symptôme

Décision métier du 2026-08-24 (JLH), avec aller-retour documenté dans la fiche api
BUG-137-01 : les ventes non mappées dans Data Integration **restent comptées** dans
l'Analyse (l'exclusion a été envisagée, implémentée quelques heures, puis écartée).

Deux défauts de lisibilité restaient :
1. le bucket sentinelle s'appelait « Non rattachés » — vocabulaire interne qui ne dit pas
   QUOI faire ; la cause réelle est « produit jamais mappé à l'étape 3 du wizard » ;
2. rien ne chiffrait ce volume sur la page : un espace massivement non mappé (Adidas
   Arena : 100 % des lignes, 4,09 M€ HT) affiche des vues dominées par un bucket géant
   sans explication — le piège BUG-300-01 (« No data for this breakdown »).

## Cause racine

Le volume non mappé n'était exposé nulle part côté page. Cause des ventes non mappées,
mesurée en base (fiche api) : produit importé au catalogue mais jamais associé à un menu
item à l'étape 3 du wizard — 0 ligne orpheline d'import sur 786 882 non mappées.

## Correction

- **Libellés** : `anUnmatchedItems` « Non rattachés » → **« Non mappées »** (EN
  'Unattached' → 'Unmapped'), `anUnmatchedShops` → **« PdV non mappés »**. Une seule clé
  i18n pilote tous les consommateurs (donuts, tables, tooltips) — aucun changement de clé
  technique (`UNATTACHED_ITEM_KEY`/`UNATTACHED_SHOP_KEY` inchangées, ce sont des clés de
  filtre).
- **Indicateur dans le bandeau rouge** (v2, retour client du 24/08 : « pas de bandeau,
  ça prend de la place ») : icône ambre `mdi-link-variant-off` dans la ligne de titre du
  bandeau rouge, visible seulement si volume > 0 ; le texte complet — « {lines} lignes de
  vente ({revenue}) ne sont pas mappées dans Data Integration — comptées sous
  « Non mappées ». » — apparaît **au survol** (title natif, comme les autres boutons du
  bandeau) ; le clic ouvre Data Integration. La v1 (v-alert dédié au-dessus des KPI) a
  vécu quelques heures puis a été retirée. Ne modifie **aucun** chiffre.
- **v3 (même jour)** : icône passée à **`mdi-alert`** (triangle warning, plus lisible que
  `link-variant-off`) et title natif remplacé par une **vraie infobulle Vuetify**
  (`v-tooltip location="bottom"`, patron `SummaryPanel.vue`) à deux lignes : le texte
  complet + « Cliquer : Ouvrir Data Integration ».
- **Source** : `useAnalyseUnmapped` (calqué sur `useTransactionBaskets` : cache par
  eventId, batch, cap `ITEM_LEVEL_EVENT_CAP` partagé) → `GET /spaces/:id/analyse-unmapped`
  (fiche api BUG-137-01). Un échec réseau met `null` en cache : le bandeau se tait plutôt
  que d'affirmer « tout est mappé » sans l'avoir vérifié. Purgé au changement d'espace
  (patron BUG-285).

## Risque de régression / à surveiller

- Le libellé « Non mappées » apparaît partout où `anUnmatchedItems` était rendu — vérifier
  qu'aucun écran hors Analyse ne donnait un autre sens à cette clé.
- `EventRevenueByShopChart.vue:428` compare une valeur au **libellé traduit**
  (`key === t('anUnmatchedItems')`) pour la couleur du bucket — le renommage reste cohérent
  puisque la comparaison passe par la même clé i18n, mais toute future comparaison en dur
  sur « Non rattachés » casserait en silence.
- Ne pas transformer ce bandeau en filtre : la décision finale est « comptées ». Cf. fiche
  api BUG-137-01 pour l'historique de l'aller-retour.

## Références

- Fiche miroir api : **BUG-137-01**
  (`api/docs/bugs/137_01_ventes_non_mappees_comptees_endpoint_informatif.md`).
- Fiches liées : [BUG-353-01](353_01_analyse_depend_du_spacemenu.md) (identité article =
  IDs du mapping), [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md) (patron
  d'alerte + règle « un total qui sous-dit doit le dire »), fiche 300-01 (le précédent
  « vide illisible »).

---

*JLH*
