# Contribuer à datafriday-web

Ce guide s'adresse à tout dev **ou agent IA** qui va lire ou modifier ce frontend. But : corriger
un bug ou ajouter une fonctionnalité sans créer de dette technique ni de régression silencieuse.

## Avant de toucher au code

1. **Vue d'ensemble** : [`docs/CARTOGRAPHIE_MODULES.md`](docs/CARTOGRAPHIE_MODULES.md) — le
   document d'entrée du projet, à lire avant de toucher au code.
2. **Comment le code est organisé techniquement** :
   [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) — organisation des dossiers
   `.vue`, conventions de nommage, pattern Vuex standard, couche API, routing, i18n, zones mortes à
   ne pas construire dessus. **À suivre pour toute nouvelle vue, composant, module de store ou
   appel API** — ne pas improviser une nouvelle convention sans vérifier ici d'abord.
3. **Le domaine concerné** : [`docs/modules/00_INDEX.md`](docs/modules/00_INDEX.md)
   contient une page par domaine métier avec les règles vérifiées contre le code réel, les bugs
   actifs et le code mort identifié.
4. **Un bug est peut-être déjà connu** : [`docs/bugs/00_INDEX.md`](docs/bugs/00_INDEX.md) — ne pas
   re-diagnostiquer ce qui est déjà documenté ; si un bug est "documenté, non corrigé par choix",
   ne pas le corriger sans validation explicite (l'arbitrage a déjà été fait — voir par exemple les
   5 bugs actifs confirmés du catalogue menu et des événements).
5. **Une architecture existante résulte peut-être d'une décision déjà prise** :
   [`docs/adr/00_INDEX.md`](docs/adr/00_INDEX.md).
6. **Si le code ou la règle métier reste ambigu après ça** : ne pas trancher seul. On n'a pas de
   base de code auto-porteuse — la compréhension fonctionnelle réelle passe par Bertrand (review,
   test, validation). Noter la question dans
   [`docs/QUESTIONS_A_BERTRAND.md`](docs/QUESTIONS_A_BERTRAND.md), la faire trancher, puis reporter
   la réponse dans la doc canonique concernée avant de coder dessus. C'est la source la plus
   fréquente de bugs et de conflits sur ce projet — deux devs qui interprètent différemment la même
   règle (voir `docs/modules/00_INDEX.md`, "Bugs actifs confirmés").

## Règles qui ne se voient pas dans le code

- **Source de vérité front = `src/` uniquement** ([ADR-0001](docs/adr/0001_vue_source_de_verite_unique.md)).
  `versionReact/` et `api-datafriday-main/` sont des prototypes/copies archivés — ne jamais s'y
  référer pour comprendre le comportement actuel, ni construire dessus.
- **Builder : v2 d'abord** ([ADR-0002](docs/adr/0002_builder_v2_relationnel_seul.md)). Tout nouveau
  code sur les zones/éléments passe par le chemin v2 (`Zone`, `ConfigurationElement`) ; ne pas
  ajouter de nouvelles écritures sur les blocs v1 legacy si des zones existent déjà pour l'espace
  concerné.
- **Éviter les requêtes lourdes non scopées** : avant de tout charger côté client, vérifier s'il
  existe un filtre serveur (`spaceId`/`configId`/`shopId`) à utiliser à la place. La latence
  dev (~600ms/requête Abidjan→Supabase) rend ce genre d'oubli particulièrement visible, mais le
  coût existe aussi en prod.
- Pas de tirets placeholder (`—`) pour une donnée absente dans les cartes/listes : préférer
  `v-if` pour omettre l'élément plutôt que d'afficher un espace réservé vide.
- **Typographie** : [`docs/CHARTE_GRAPHIQUE.md`](docs/CHARTE_GRAPHIQUE.md) ([ADR-0003](docs/adr/0003_charte_graphique_typographie.md))
  — 1 police d'interface (stack système) + 1 police monospace technique, échelle fermée de 7
  paliers de taille, 4 poids (400/500/600/700). Tout nouveau `font-size`/`font-weight`/
  `font-family` doit s'y conformer ; ne pas migrer les pages existantes sans demande explicite.

## Corriger un bug

1. Vérifier `docs/bugs/00_INDEX.md` — le bug a peut-être déjà une cause racine identifiée.
2. Corriger, puis **mettre à jour la fiche existante** (statut, correction, risque de régression)
   ou en créer une nouvelle avec [`docs/bugs/TEMPLATE.md`](docs/bugs/TEMPLATE.md) si elle n'existe
   pas.
3. **Tester dans le navigateur**, pas seulement via le build/typecheck — un build qui passe ne
   garantit pas que le parcours utilisateur fonctionne (formulaires, drawers, wizards en
   particulier, sources fréquentes de régressions silencieuses ici).
4. Si le bug est transverse (implique aussi le backend), vérifier/mettre à jour la fiche miroir
   côté [`api-datafriday-staging/docs/bugs/`](../api-datafriday-staging/docs/bugs/).

## Ajouter une fonctionnalité

- Si elle touche un choix structurant (modèle front, découpage de module, convention de données),
  envisager une nouvelle ADR plutôt que de laisser la décision implicite dans le code.
- Vérifier `docs/modules/<domaine>.md` pour ne pas reproduire une incohérence déjà identifiée
  ailleurs dans le même domaine (ex. deux règles d'expansion combo incompatibles).

## Workflow Git

- Chacun code avec **ses propres identifiants Git** — pas de compte partagé, chaque commit doit
  être traçable à une personne.
- Travailler sur une branche perso (`feat/...`, `fix/...`), jamais de push direct sur `develop` ni
  `staging`.
- `staging` est la base de travail actuelle (issue du nettoyage du 2026-07-15, plus propre que
  `develop`). Ouvrir une PR vers `staging` ; **seul le lead merge/pousse sur `staging` ou
  `develop`**, après revue — fonctionnelle par Bertrand si le changement s'appuie sur une
  compréhension du code qui n'était pas encore validée (voir
  [`docs/QUESTIONS_A_BERTRAND.md`](docs/QUESTIONS_A_BERTRAND.md) ci-dessus).
- Ne jamais merger un code qui repose sur une hypothèse encore marquée 🔴 dans le tracker de
  clarification.

## Déploiement — ce qu'il faut savoir avant de pousser

- Push sur `develop` déclenche aujourd'hui un déploiement Cloudflare **en production**, sans suite
  de tests bloquante — c'est pour ça que `develop` est maintenant une branche protégée (voir
  Workflow Git ci-dessus) : un push direct dessus part en prod sans revue.
- Ce pipeline est en cours de révision (cible possible : Vercel) — vérifier l'état actuel avant de
  supposer que `develop` est un environnement de staging sûr.

## Notes personnelles

Un brouillon, une exploration, un résumé provisoire à usage perso → [`docs/scratch/`](docs/scratch/README.md)
(gitignoré, sauf son README). Dès que la note contient quelque chose d'utile au projet, elle migre
vers la doc canonique (module, `docs/bugs/`, `docs/adr/`, `docs/QUESTIONS_A_BERTRAND.md`) — ce
dossier ne doit jamais devenir une doc parallèle non maintenue.
