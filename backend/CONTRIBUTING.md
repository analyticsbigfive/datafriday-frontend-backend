# Contribuer à api-datafriday-staging

Ce guide s'adresse à tout dev **ou agent IA** qui va lire ou modifier ce backend. But : corriger
un bug ou ajouter une fonctionnalité sans créer de dette technique ni de régression silencieuse.

## Avant de toucher au code

1. **Vue d'ensemble** : [`docs/INDEX.md`](docs/INDEX.md) → [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
   (ou [`HEOS_ARCHITECTURE_GUIDE.md`](docs/architecture/HEOS_ARCHITECTURE_GUIDE.md) pour le pattern
   de dispatch).
2. **Le module concerné** : chercher dans `docs/api/`, `docs/auth/`, `docs/weezevent/`, etc., ou côté
   frontend [`datafriday-web/docs/CARTOGRAPHIE_MODULES.md`](../datafriday-web/docs/CARTOGRAPHIE_MODULES.md)
   pour la vue transverse backend↔frontend.
3. **Un bug est peut-être déjà connu** : [`docs/bugs/00_INDEX.md`](docs/bugs/00_INDEX.md) — ne pas
   re-diagnostiquer ce qui est déjà documenté ; si un bug est "documenté, non corrigé par choix",
   ne pas le corriger sans validation explicite (l'arbitrage a déjà été fait).
4. **Une architecture existante résulte peut-être d'une décision déjà prise** :
   [`docs/adr/00_INDEX.md`](docs/adr/00_INDEX.md) — la contourner sans le savoir recrée
   généralement un bug déjà résolu.
5. **Si le code ou la règle métier reste ambigu après ça** : ne pas trancher seul. On n'a pas de
   base de code auto-porteuse — la compréhension fonctionnelle réelle passe par Bertrand (review,
   test, validation). Noter la question dans
   [`docs/QUESTIONS_A_BERTRAND.md`](docs/QUESTIONS_A_BERTRAND.md), la faire trancher, puis reporter
   la réponse dans la doc canonique concernée avant de coder dessus. C'est la source la plus
   fréquente de bugs et de conflits sur ce projet — deux devs qui interprètent différemment la même
   règle.

## Règles qui ne se voient pas dans le code

- **Migrations toujours manuelles** ([ADR-0002](docs/adr/0002_migrations_manuelles_jamais_plateforme.md)) :
  Render exécute bien `prisma migrate deploy` au démarrage, mais `prisma/migrations/*` est
  gitignoré donc c'est un **no-op silencieux** — rien n'est jamais réellement appliqué par la
  plateforme. Toute migration doit être lancée à la
  main (`prisma migrate deploy`, `.env` ciblé sur l'environnement exact) **avant ou avec** le
  déploiement du code qui en dépend — jamais après. C'est la cause la plus fréquente d'incidents de
  déploiement sur ce projet.
- **Ne pas écrire dans les colonnes JSON gelées** (`MenuItem.spacePrices`/`spaceIds`,
  `Config.data`) : elles sont conservées pour compat descendante mais plus lues par le code vivant
  ([ADR-0003](docs/adr/0003_spacemenuitem_source_verite_prix_espace.md)). Écrire dedans réintroduit
  une désynchronisation déjà corrigée.
- **`DATABASE_URL`** = pooler Supabase (port 6543, `pgbouncer=true`) pour le runtime ;
  **`DIRECT_URL`** (port 5432) réservée aux migrations. Ne pas les confondre.
- **`pnpm`**, pas `npm`/`yarn`, pour ce projet.

## Corriger un bug

1. Vérifier `docs/bugs/00_INDEX.md` — le bug a peut-être déjà une cause racine identifiée.
2. Corriger, puis **mettre à jour la fiche existante** (statut, correction, risque de régression)
   ou en créer une nouvelle avec [`docs/bugs/TEMPLATE.md`](docs/bugs/TEMPLATE.md) si elle n'existe
   pas.
3. Si le fix touche un modèle de données existant depuis un moment, se demander s'il faut un
   **script de backfill** pour les données déjà affectées — un fix qui ne corrige que les
   nouvelles écritures laisse les anciennes fausses (cf. BUG-001, coût MenuComponent).
4. Tester sur staging avant prod. Ne jamais fermer une fiche bug "corrigé" tant que le code n'est
   pas buildé et testé (distinguer explicitement "corrigé en code" de "corrigé et déployé").

## Ajouter une fonctionnalité

- Si elle touche un choix structurant (modèle de données, découpage de module, infra), envisager
  une nouvelle ADR plutôt que de laisser la décision implicite dans le code.
- Un endpoint ajouté doit être classé dans la couche HEOS adaptée (Prisma direct / cache / vue
  matérialisée / Edge Function / job async) plutôt que systématiquement fait en Prisma direct par
  défaut — voir [ADR-0001](docs/adr/0001_architecture_heos.md).
- Si un endpoint est ajouté/modifié, régénérer la doc API : `pnpm docs:api` (génère
  `docs/api/API_REFERENCE.md` et `openapi.json` — ne pas les éditer à la main).

## Workflow Git

- Chacun code avec **ses propres identifiants Git** — pas de compte partagé, chaque commit doit
  être traçable à une personne.
- Travailler sur une branche perso (`feat/...`, `fix/...`), jamais de push direct sur `main`.
- Ouvrir une PR vers `main`. **Seul le lead merge/pousse sur `main`**, après revue — fonctionnelle
  par Bertrand si le changement s'appuie sur une compréhension du code qui n'était pas encore
  validée (voir [`docs/QUESTIONS_A_BERTRAND.md`](docs/QUESTIONS_A_BERTRAND.md) ci-dessus).
- Ne jamais merger un code qui repose sur une hypothèse encore marquée 🔴 dans le tracker de
  clarification.

## Déploiement — ce qu'il faut savoir avant de pousser

- Push sur `main` déclenche un déploiement Render (+ Edge Functions) sans suite de tests
  bloquante. Vérifier que le code est prêt avant de pousser sur `main` — et rappel : seul le lead
  pousse sur `main` (voir Workflow Git ci-dessus), donc c'est le dernier filet avant prod.
- Voir [`docs/getting-started/DEPLOYMENT.md`](docs/getting-started/DEPLOYMENT.md) pour la procédure
  complète (staging vs prod, variables d'env, checklist).

## Notes personnelles

Un brouillon, une exploration, un résumé provisoire à usage perso → [`docs/scratch/`](docs/scratch/README.md)
(gitignoré, sauf son README). Dès que la note contient quelque chose d'utile au projet, elle migre
vers la doc canonique (module, `docs/bugs/`, `docs/adr/`, `docs/QUESTIONS_A_BERTRAND.md`) — ce
dossier ne doit jamais devenir une doc parallèle non maintenue.
