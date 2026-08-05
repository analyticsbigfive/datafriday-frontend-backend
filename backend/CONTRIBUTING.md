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
  `prisma/migrations/*` est versionné (depuis le 2026-08-02, pour corriger un drift entre postes),
  mais `prisma migrate deploy` a été **retiré** des commandes de démarrage (`render.yaml`,
  `docker-compose.production.yml`, `docker-compose.staging.yml`) — Render/Docker ne migrent donc
  jamais tout seuls, garde-fou explicite dans le code plutôt qu'accidentel via le gitignore. Toute
  migration doit toujours être lancée à la main (`prisma migrate deploy`, `.env` ciblé sur
  l'environnement exact) **avant** de déployer le code qui en dépend. C'est la cause la plus
  fréquente d'incidents de déploiement sur ce projet.
- **Où écrire une migration** (règle JLH du 2026-08-04, vaut aussi pour les sous-agents) : toute
  nouvelle migration de schéma va dans `prisma/migrations/<YYYYMMDDHHMMSS>_<slug_snake_case>/migration.sql`
  — **plus dans `prisma/sql/`**, qui ne garde que l'historique déjà là et les scripts qui ne sont
  pas des migrations (audits en lecture seule, nettoyages en deux phases, réparations ponctuelles).
  Respecter le format en dossier : un `.sql` posé en vrac à la racine de `prisma/migrations/` est
  ignoré par Prisma. Ne pas toucher `migration_lock.toml`. Le timestamp doit être postérieur au
  dernier dossier présent. Ça ne change **rien** au point précédent : l'application reste manuelle.
  Le dossier et son `migration.sql` s'écrivent **à la main** : ne jamais lancer `prisma migrate dev`
  (ni `--create-only`) — la commande se connecte à la base et peut la réinitialiser. Et une fois une
  migration appliquée, ne plus toucher son `migration.sql` : Prisma en stocke la somme de contrôle et
  `migrate deploy` refuserait de tourner.
- **⚠️ État de `_prisma_migrations` non vérifié (au 2026-08-04)** : `prisma migrate deploy` ne fait
  ce qu'on croit que si la table `_prisma_migrations` de l'environnement visé enregistre déjà les
  dossiers existants comme appliqués. L'historique du projet est mixte (migrations Prisma formelles,
  scripts psql à la main, fichiers `prisma/sql/` jamais appliqués) et rien dans le dépôt ne trace
  l'état réel par base. Si la table est vide ou partielle, `migrate deploy` rejoue tout et échoue sur
  `relation already exists`. À faire trancher par JLH avant de recommander la commande sur un
  environnement donné ; le cas échéant, `prisma migrate resolve --applied <dossier>` pour aligner
  l'historique sans rejouer le DDL. Point acquis en revanche : `schema.prisma` déclare
  `directUrl = env("DIRECT_URL")`, donc `prisma migrate deploy` utilise la connexion directe (5432)
  tout seul — jamais le pooler.
- **Aucun backtick dans le SQL**, nulle part : ni dans les templates `Prisma.sql` (un backtick en
  commentaire ferme le template et casse le build TypeScript sur Render, cf. BUG-286-01), ni dans
  `prisma/sql/*.sql`, ni dans `prisma/migrations/*/migration.sql`. Citer un identifiant avec « … »
  ou sans rien.
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
