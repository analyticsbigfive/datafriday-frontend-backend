# BUG-278-01 — Analyse : pagination du tableau « par shop » en carré blanc illisible en dark mode

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟡 Mineur (navigation possible mais bouton de page illisible)
- **Domaine** : Analyse & agrégation / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (capture utilisateur) — JLH
- **Fichiers** : `src/components/analyse/tables/MenuItemsByShopTable.vue:172,237` (`v-pagination`),
  bloc `.mibs--dark` en fin de `<style>`

## Symptôme

En thème sombre, la pagination sous le tableau « Menu items par shop » (page `/spaces/:id`)
affiche un bouton de page en carré blanc arrondi au contenu invisible (capture : `‹ 1 ▢ ›`,
chevron droit grisé = dernière page).

## Cause racine

Le bloc `.mibs--dark` du composant couvrait tout le custom clair **sauf** la pagination — le
commentaire du bloc affirmait « les internes Vuetify (pagination) suivent le thème global
sombre ». Constat écran contraire. Analyse statique : `VPagination` 3.12.4 ne pose par
elle-même **aucun** fond (items `variant="text"`, aucun style `--is-active` dans
`VPagination.css`) ni aucune distinction visuelle de la page active — la source exacte du fond
blanc n'est **pas identifiable statiquement** (aucune règle `v-pagination`/`aria-current` dans
`App.vue`, `style.css`, `index.css`, ni Bootstrap ; à confirmer en DevTools sur l'élément).

## Correction

Corrigé le 2026-08-02 : override défensif ajouté en fin de bloc `.mibs--dark` — force
`background: transparent; color:#d1d5db` sur tous les boutons de la pagination (tue le fond
blanc quelle qu'en soit la source) + pastille discrète `rgba(255,255,255,.12)` sur
`.v-pagination__item--is-active` (Vuetify ne distingue pas la page active par défaut). Même
override répliqué sur la 2ᵉ `v-pagination` du domaine (`ShopPerformanceByTransactionRate.vue`,
traitée dans BUG-280). Thème clair inchangé (règles gatées `.mibs--dark`).

**Durci le 2026-08-03** (récidive constatée à l'écran) : les 2 blocs passent en `!important` —
la 2ᵉ investigation a établi que la 1ʳᵉ version perdait probablement la cascade. Verdict
approfondi : la source du fond blanc est **extérieure au code du repo** — Vuetify 3.12.4 ne
peint rien (`VPagination.css` = 2 règles de layout, items `variant="text"`, mécanisme
`provideDefaults`/`_as` vérifié fonctionnel), aucune règle d'`App.vue`/`style.css`/`index.css`/
Bootstrap ne cible `.v-pagination`/`aria-current`/`.v-btn` avec un fond clair, et la signature
« fond blanc + texte invisible » implique deux règles distinctes (une ne posant QUE le
background). Suspects restants : feuille injectée à l'exécution ou artefact d'extension
navigateur. Diagnostic définitif si récidive malgré `!important` : DevTools sur le bouton →
panneau Computed → `background-color` → la déclaration gagnante affiche sa feuille d'origine.

## Risque de régression / à surveiller

- Si l'élément blanc venait d'une source runtime encore active (règle injectée dynamiquement),
  l'override transparent la neutralise mais la cause resterait non documentée — vérifier en
  DevTools (computed `background-color` du bouton) lors du contrôle visuel.
- La pastille « page active » n'existe qu'en sombre (le clair reste sans distinction, comportement
  Vuetify d'origine — à harmoniser un jour si souhaité).

## Références

- [BUG-280](280_01_analyse_charts_darkmode_phase2.md) — même session, reste du domaine Analyse.
- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — passe dark des 17
  fichiers UI Analyse (la pagination n'y était pas couverte).
