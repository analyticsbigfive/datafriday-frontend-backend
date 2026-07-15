# ADR-0002 — Les migrations Prisma ne sont jamais appliquées automatiquement par la plateforme d'hébergement

- **Statut** : Accepté
- **Date** : formalisé le 2026-07-15 (pratique constatée et suivie depuis courant 2026-06/07)
- **Domaine** : Déploiement / Base de données

## Contexte

**Correction du 2026-07-15** (vérifié dans `render.yaml` — la version initiale de cet ADR décrivait
mal le mécanisme) : le `startCommand` Render exécute bien `npx prisma migrate deploy` au démarrage
des deux services (API + worker) — ce n'est donc PAS une absence totale d'automatisation. Mais
`prisma/migrations/*` est gitignoré (seul `.gitkeep` est versionné, voir `.gitignore:47-48`) : le
code buildé par Render ne contient donc **aucun fichier de migration**, et la commande s'exécute à
chaque déploiement sans jamais rien trouver à appliquer — un **no-op silencieux**, pas une
désactivation. Ça donne l'illusion trompeuse d'un déploiement de migration automatique alors qu'il
ne se passe rien. Un déploiement de code qui dépend d'une migration non appliquée manuellement
casse donc quand même en prod avec des erreurs Prisma sur colonnes/tables manquantes.

Alternative non retenue : versionner `prisma/migrations/*` pour que le `startCommand` Render les
applique réellement — non fait à ce jour, raison non documentée (probablement pour garder un
contrôle humain explicite sur le moment où une migration s'applique, plutôt que de la coupler
automatiquement au déploiement de code).

## Décision

Toute migration Prisma doit être appliquée **manuellement**, en ciblant explicitement
l'environnement via le bon `.env` (`DATABASE_URL`/`DIRECT_URL`), **avant ou en même temps que** le
déploiement du code qui en dépend — jamais après, jamais en comptant sur Render ou une quelconque
plateforme pour le faire à notre place.

## Conséquences

Toute PR qui ajoute une migration Prisma doit indiquer explicitement, dans sa description, la
commande de migration à lancer et sur quel environnement. Un oubli casse silencieusement la prod
(erreurs 500 sur colonnes manquantes) — c'est la cause racine la plus fréquente des incidents de
déploiement observés sur ce projet à ce jour. Voir `docs/bugs/` pour tout incident lié à cette
règle.

## Références

- `getting-started/DEPLOYMENT.md` §6.1, §7
- `render.yaml`
- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #6 (source de la correction du 2026-07-15)
