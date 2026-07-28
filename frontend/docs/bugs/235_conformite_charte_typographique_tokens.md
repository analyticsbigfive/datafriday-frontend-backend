# BUG-235 — Conformité à la charte typographique : tokens, lint & migration progressive

- **Statut** : 🟡 En cours (chantier de conformité, pas un défaut fonctionnel)
- **Sévérité** : 🟢 Cosmétique (cohérence visuelle ; aucun impact fonctionnel)
- **Domaine** : Transverse / Charte graphique
- **Ouvert le** : 2026-07-27 · **Dernière mise à jour** : 2026-07-28 (emmanuel)
- **Réf** : [`CHARTE_GRAPHIQUE.md`](../CHARTE_GRAPHIQUE.md), [ADR-0003](../adr/0003_charte_graphique_typographie.md)

## Constat

La charte typographique (7 tailles rem, 4 poids, 2 polices) existait mais n'était **ni
codifiée ni vérifiée** : un simple tableau Markdown. Le code réel comptait ~90 tailles
distinctes, ~1500 déclarations `font-size` en px (interdit), des poids fantaisistes
(`650/750/800`), et un webfont Roboto chargé pour rien (vestige du portage React). Rien
n'empêchait d'introduire de nouvelles valeurs hors charte.

## Traitement

Chantier en trois volets (commits sur `fix/according-toGraphicChart`) :

1. **Nettoyage police** (`33f3894`) : retrait du chargement Roboto (`webfontloader`) —
   police système inchangée, une requête réseau tierce en moins. Dépendance
   `webfontloader` de `package.json` devenue inutilisée (à retirer via
   `pnpm remove webfontloader` séparément, pour ne pas désync le lockfile).
2. **Tokens + garde-fou** (`7d226eb`) :
   - Tokens CSS dans `src/style.css` (`:root`) : `--font-ui`/`--font-mono`,
     `--fs-xs..--fs-xxl`, `--fw-regular..--fw-bold`. Purement additif (zéro changement
     visuel ; `html/body` reprend le même stack système).
   - Checker sans dépendance [`scripts/check-typography.mjs`](../../scripts/check-typography.mjs)
     + script `pnpm lint:typo`. Mode par défaut = **lignes ajoutées au diff** → applique
     la charte au code NEUF sans exiger l'existant (migration opportuniste, charte §5) ;
     exit 1 → branchable CI/pre-commit. Remonte toutes les fautes d'une ligne.
3. **Migration opportuniste par domaine** vers les tokens (transform limité aux blocs
   `<style>` + styles inline/chaînes JS traités à la main ; mapping « palier le plus
   proche », même algo que le checker). Diff strictement limité aux lignes
   `font-size`/`font-weight`.

### Avancement par domaine

| Domaine | Statut | Commit |
|---|---|---|
| role | ✅ conforme | `7d226eb` |
| user | ✅ conforme | `7d226eb` |
| market-prices | ✅ conforme | `a85c0ef` |
| events | ✅ conforme | `a85c0ef` |
| spaces | ✅ conforme | `52893fd` |
| analyse | ✅ conforme | `be937ec` |
| hr | ✅ déjà conforme (aucune violation) | — |
| **menu-fb** (~394) | ⚪ à faire | — |
| **views** (~231, auth/dashboard/Space*) | ⚪ à faire | — |
| **EventPredictView** (~47, monolithe 9,3k lignes) | ⚪ à faire (prudemment, à part) | — |

État global : `pnpm lint:typo --all` (~1200 violations legacy restantes au 2026-07-28).

## Impact visuel

Très majoritairement **nul** (px→rem exact) ou **sub-pixel** (snaps ±0,5–1px). Seuls
changements réellement visibles, à valider à l'écran : quelques titres `800/750→700` (un
peu moins gras), `22→20px` / `18→16px` (titres), et des micro-labels `8–10px→11px` (le
plus petit palier de la charte). Réversible via git par domaine.

## À surveiller / reste à faire

- **Migration** : poursuivre par domaine (menu-fb, views, EventPredictView). Chaque lot
  doit être **validé à l'écran** en clair ET en sombre.
- **Lint non branché en CI/pre-commit** : le garde-fou existe mais n'est pas encore
  exécuté automatiquement (pas de husky ; pas de lint dans le pipeline). Tant que ce n'est
  pas branché, l'application au code neuf reste manuelle.
- **Dette police résiduelle** : le reset Tailwind généré (`src/index.css:243/281`) reste ;
  vrai correctif = retirer Tailwind du portage React (chantier à part). Sans effet
  aujourd'hui (`@layer base`, priorité la plus basse). + dépendance `webfontloader`
  inutilisée dans `package.json`.
