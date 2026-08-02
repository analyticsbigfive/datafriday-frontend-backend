# ADR-0002 — Les migrations Prisma ne sont jamais appliquées automatiquement par la plateforme d'hébergement

- **Statut** : Accepté — réaffirmé et renforcé le 2026-08-02, voir « Mise à jour »
- **Date** : formalisé le 2026-07-15 (pratique constatée et suivie depuis courant 2026-06/07)
- **Domaine** : Déploiement / Base de données

## Mise à jour 2026-08-02 — `prisma/migrations/*` n'est plus gitignoré, garde-fou ajouté au code

`prisma/migrations/*` a été retiré de `.gitignore` sur demande explicite (drift récurrent constaté :
une migration appliquée en base sans fichier local correspondant sur ce poste, symptôme direct du
fait que chaque dev avait son propre historique local jamais partagé). Le dossier est désormais
versionné et va au build Render.

Ça supprimait le mécanisme de protection *involontaire* décrit dans « Contexte » ci-dessous : sans
garde-fou, le `startCommand` Render (`npx prisma migrate deploy && node dist/main`) serait passé de
no-op silencieux à **exécution réelle** au démarrage du service — l'automatisation que la décision
d'origine excluait explicitement (« jamais en comptant sur Render... pour le faire à notre place »).

**Correction appliquée le jour même** : `npx prisma migrate deploy &&` retiré du `startCommand` dans
`render.yaml` (services `datafriday-api` et `datafriday-worker`) et de la `command:` dans
`docker-compose.production.yml`/`docker-compose.staging.yml` — remplacé par un simple démarrage de
l'app (`node dist/main` / `node dist/worker`). Le garde-fou est désormais **explicite dans le code**
(commande absente) plutôt qu'accidentel (fichiers absents) : la décision « migrations toujours
manuelles » ci-dessous reste donc pleinement en vigueur, la traçabilité git est en plus corrigée, et
`docker-compose.yml` (dev local, `npx prisma generate && node dist/main` — pas de `migrate deploy`)
n'était pas concerné.

## Contexte

**Correction du 2026-07-15** (vérifié dans `render.yaml` — la version initiale de cet ADR décrivait
mal le mécanisme) : le `startCommand` Render exécute bien `npx prisma migrate deploy` au démarrage
des deux services (API + worker) — ce n'est donc PAS une absence totale d'automatisation. Mais
`prisma/migrations/*` était gitignoré (seul `.gitkeep` était versionné) : le code buildé par Render
ne contenait donc **aucun fichier de migration**, et la commande s'exécutait à chaque déploiement
sans jamais rien trouver à appliquer — un **no-op silencieux**, pas une désactivation. Ça donnait
l'illusion trompeuse d'un déploiement de migration automatique alors qu'il ne se passait rien. Un
déploiement de code qui dépendait d'une migration non appliquée manuellement cassait donc quand
même en prod avec des erreurs Prisma sur colonnes/tables manquantes.

**Ce mécanisme de protection involontaire a été remplacé le 2026-08-02 par un garde-fou explicite**
(voir « Mise à jour » ci-dessus) : `prisma/migrations/*` est maintenant versionné, mais
`prisma migrate deploy` a été retiré des commandes de démarrage — le résultat (aucune migration
appliquée automatiquement) est inchangé, seul le mécanisme change.

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
