# Questions à Bertrand — tracker de clarification

> On n'a pas de base de code auto-porteuse : la compréhension fonctionnelle réelle passe par
> Bertrand (review, test, validation). Ce fichier évite que chacun tranche seul dans son coin une
> incompréhension du code ou d'une fonctionnalité — ce qui est la source la plus fréquente de bugs
> et de conflits sur ce projet (voir [`docs/bugs/00_INDEX.md`](bugs/00_INDEX.md), plusieurs bugs
> viennent de deux devs ayant chacun implémenté sa propre interprétation de la même règle).

## Comment l'utiliser

1. Bloqué sur une incompréhension (code, règle métier, comportement attendu) → ajouter une ligne
   ci-dessous, statut 🔴.
2. Poser la question à Bertrand.
3. Une fois répondu : mettre à jour la doc canonique concernée (page de module dans
   `datafriday-web/docs/modules/`, [`docs/adr/`](adr/00_INDEX.md), ou
   [`docs/bugs/`](bugs/00_INDEX.md) si la réponse révèle un bug) — **et le code si la réponse
   implique un renommage/commentaire/refactor** — puis lier la mise à jour ici et passer le
   statut à 🟢.
4. **Ne jamais merger un code qui repose sur une hypothèse encore marquée 🔴.**

Même mécanique pour une fonctionnalité neuve : confronter le cahier des charges au code existant,
lister ici ce qui reste ambigu, trancher avec Bertrand avant d'écrire le code définitif.

## Questions ouvertes

| # | Question | Domaine | Posée par | Date | Statut | Repliée dans |
|---|---|---|---|---|---|---|
| — | _(aucune question pour l'instant — ajouter une ligne au premier blocage)_ | | | | | |

## Questions résolues

| # | Question | Réponse (résumé) | Repliée dans |
|---|---|---|---|
| — | | | |
