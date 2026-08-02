# BUG-269-01 — Analyse : le tooltip « CA par shop » liste 30+ PDV et masque le nom de l'événement

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-02
- **Fichiers** : `EventRevenueByShopChart.vue:520-600`

## Symptôme

Écran Analyse, graphe « CA par shop (HT) » en mode empilé (`viewMode: Shops`). Sur un tenant à
beaucoup de points de vente (SFP : ~30 PDV), survoler une barre ouvre un tooltip qui liste
**toutes** les séries du stack, une ligne par PDV. Le tooltip mesure alors plus haut que le graphe
lui-même.

Conséquence concrète : le tooltip est ancré au curseur et croît **vers le haut**
(`transform: translate(-50%, -100%)`), donc son en-tête — **le nom de l'événement survolé** —
sort du haut de la fenêtre. L'utilisateur ne sait plus de quel événement il lit les chiffres, ce
qui est précisément l'information qu'il cherchait. S'y ajoute que la majorité des lignes affichent
« € 0 » (PDV du catalogue n'ayant rien vendu sur cet événement) : le bruit domine le signal.

## Cause racine

Pas un bug de calcul : `externalTooltipHandler` (`EventRevenueByShopChart.vue`) rendait
inconditionnellement une ligne HTML par entrée de `tooltip.body`. Avec `mode: 'index'` sur un
graphe empilé, Chart.js fournit **une entrée par dataset**, soit un PDV chacun. Aucun plafond
n'était appliqué — le composant a été écrit sur des tenants à ~10 PDV où le problème ne se voyait
pas.

À noter : la page possédait déjà le remède ailleurs. `EventTimelineChart.vue:398-443` plafonne à
`TOP_N = 10` avec une série « Autres » (clé i18n `anTimelineOthers`) — mais **au niveau des
datasets**, ce qui est impossible ici sans détruire le rendu empilé multicolore des barres.

## Correction

Branche `feat/debugMenuItems`. Plafond appliqué **au niveau du tooltip uniquement** — les barres
empilées conservent tous leurs segments, seul le survol est limité :

- `TOOLTIP_TOP_N = 10` : seuls les 10 meilleurs PDV **de la barre survolée** sont détaillés. Le
  classement est donc par événement, pas global — on lit le top 10 de l'événement qu'on regarde.
- Les PDV restants sont repliés en une ligne `Autres (N) : €X` portant la **somme** de leurs CA,
  pastille grise `#9ca3af` (même couleur que la série « Autres » de `EventTimelineChart`).
- Les PDV à **0 €** sont exclus : ils n'ont rien vendu sur cet événement, et les compter dans le
  « (N) » ferait afficher le catalogue complet des points de vente plutôt que les contributeurs
  réels. Ils ne sont donc ni détaillés, ni comptés dans « Autres ».
- La courbe **« CA cumulé »** (`dataset.type === 'line'`) n'est pas un PDV : jamais repliée,
  toujours rendue en tête du corps.
- Le pied de tooltip (`Total : … · Part globale : …`) est inchangé et reste calculé sur le total
  **réel** de la barre, pas sur les seules lignes affichées — le total continue donc de coller à la
  hauteur de la barre même quand des PDV sont repliés.

Implémentation : `tooltip.body`, `tooltip.labelColors` et `tooltip.dataPoints` sont construits par
Chart.js dans le même ordre ; on les recolle par index pour retrouver la valeur numérique derrière
chaque ligne déjà formatée par le callback `label`, puis on trie/tronque. Aucune logique de
formatage dupliquée.

i18n : nouvelle clé `anChartTooltipOthers` (fr « Autres » / en « Others »), dans la famille
`anChartTooltip*` déjà utilisée par ce composant.

## Risque de régression / à surveiller

- **L'alignement par index est le point sensible.** Il tient parce que le callback `label` de ce
  graphe renvoie toujours **une seule chaîne** par point. Si quelqu'un le fait renvoyer un tableau
  (Chart.js l'autorise, pour du multi-ligne), `body[i].lines` aura plusieurs entrées et le
  recollage `body[i]` ↔ `dataPoints[i]` restera correct — mais un retour à un `flatMap` sur
  `lines` casserait tout. Ne pas revenir à cette forme.
- Vérifier sur un tenant à **moins de 10 PDV** que rien ne change : pas de ligne « Autres », toutes
  les lignes présentes, ordre trié par CA décroissant (l'ordre n'est plus celui des datasets —
  changement voulu mais visible).
- Vérifier que « CA cumulé » apparaît toujours quand le switch est activé, y compris sur un
  événement où plus de 10 PDV ont vendu.
- Le tri par valeur décroissante s'applique désormais aussi aux tenants sans repli. Si un
  utilisateur s'attendait à l'ordre de la légende, c'est le seul effet de bord assumé.
- `TOOLTIP_TOP_N` est un plafond d'affichage, pas un filtre de données : aucun KPI, export ou
  calcul de part n'en dépend.

## Références

- `EventTimelineChart.vue:398-443` — même stratégie top-10 + « Autres », mais au niveau des
  datasets (le graphe n'y est pas empilé par PDV).
- `TransactionCategoryMixChart.vue:128` — troisième occurrence du motif « Autres (N) ».
- `docs/modules/02_ANALYSE.md` § « Frontend — composants ».
