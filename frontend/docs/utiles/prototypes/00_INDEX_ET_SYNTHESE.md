# Confrontation prototype Supabase KV (2024) ↔ base de connaissance actuelle

> Réalisé le 2026-07-15. Le prototype se trouve dans `datafriday-web/old/docs-api-supabase-kv/`
> (hors git, quarantaine) : un unique serveur Supabase Edge Function (Hono + un store clé-valeur
> générique table unique `kv_store_eb31619c(key, value)`), 9 fichiers, ~15 365 lignes, 204 routes.
> C'est la **toute première version** de Data Friday (log de debug daté du 16/12/2024), antérieure
> même au portage React archivé dans `versionReact/`.
>
> Méthode : 4 agents ont lu l'intégralité du prototype (fichiers entiers + plages ciblées
> d'`index.tsx`) et confronté chaque domaine à nos docs actuelles dans `docs/utiles/`
> (`ALGORITHME_PREDICTION_NEW_RULES.md`, `PEPITES_EXTRAITES.md`, `DESIGN_TEAMS_SPORT_EVENTS.md`,
> `GUIDE_PARCOURS_APP.md`). Le détail intégral de chaque agent est dans les 4 fichiers de ce dossier :
> - [01_ALGORITHME_PREDICTION_SCORING.md](01_ALGORITHME_PREDICTION_SCORING.md)
> - [02_AGREGATION_REVENUS_WEEZEVENT.md](02_AGREGATION_REVENUS_WEEZEVENT.md)
> - [03_TAXONOMIE_CATALOGUE.md](03_TAXONOMIE_CATALOGUE.md)
> - [04_SPACES_EVENTS_MAPPINGS.md](04_SPACES_EVENTS_MAPPINGS.md)

## Verdict global

Le prototype n'est **pas** une version antérieure du même algorithme de prédiction — c'est un stade
où l'algorithme automatique **n'existait pas encore**. Sur les autres domaines (agrégation revenus,
taxonomie catalogue, spaces/events/mappings), la confrontation est en revanche très riche : elle
**confirme** que plusieurs bugs/leçons documentés comme résolus dans `PEPITES_EXTRAITES.md` sont des
motifs récurrents qui existaient déjà ici, 18 mois plus tôt.

## Ce que ça confirme

- **Anti-pattern delete-then-recreate** (§3.4 de PEPITES) : le prototype supprimait déjà tous les
  `event-timeline:{eventId}` avant de tout recalculer — preuve vivante du problème que le fix
  "sync idempotent UPSERT" est venu résoudre.
- **"Deux formules qui s'écrasent"** (§3.2 de PEPITES) : deux chemins de calcul du revenu event
  écrivaient déjà le même champ avec des logiques différentes dans le prototype.
- **Bornage par `eventEndDate`** (§3.2 de PEPITES) : la règle existait déjà, avec une nuance non
  documentée à vérifier côté actuel (voir « Question ouverte » plus bas).
- **Refonte MarketPrice/MenuItem de juillet 2026 nécessaire** : confirmé — MarketPrice n'avait dans
  le prototype qu'un `category` en texte libre, aucun référentiel structuré.
- **`readyForSale` est une invention récente** : absent du prototype, ce n'est pas un héritage perdu
  puis retrouvé, c'est une règle construite après.
- **Le service `teams` mort cité par `DESIGN_TEAMS_SPORT_EVENTS.md`** (500/522) est identifié :
  c'est littéralement le code lu ici (`index.tsx` routes `/teams`).

## La découverte la plus importante : une classe de bug récurrente

**"Un identifiant d'élément dérivé de la position sur le plan sert de clé stable pour un mapping
externe → il casse à chaque re-sauvegarde du plan."**

Cette classe de bug a frappé **deux fois à 18 mois d'écart** :
1. Dans le prototype (2024) : mappings shop↔element cassés par des floor-element-ids volatiles,
   avec son propre endpoint de réparation (`migrate-shop-element-ids`, `cleanup-shop-mappings`).
2. En prod NestJS (2026-06-28, mémoire `project_data_integration_unmapping_rootcause`) :
   `SpaceElement.id` régénéré au `saveConfiguration` → mappings Data Integration orphelins.

**Conséquence pour la doc finale** : ce n'est pas un bug isolé à corriger au coup par coup, c'est un
défaut de conception structurel de "id dérivé du plan = clé de mapping externe" qui reviendra tant
que ce choix d'architecture n'est pas changé. Un outil de diagnostic/réparation générique
(façon `diagnose-menu-mappings` déjà dans le prototype) serait plus robuste qu'un patch ponctuel à
chaque récidive.

## Pépites à fort intérêt pour la doc finale

| Pépite | Source | Statut à vérifier |
|---|---|---|
| P&L complet par Category/Type (coût moyen, prix moyen, marge moyenne, par espace) | §3 rapport taxonomie | Existe-t-il un équivalent aujourd'hui ? Semble absent. |
| Seuils de marge par Type (défaut 68/75 %) pour colorer l'UI | §3 rapport taxonomie | Fonctionnalité potentiellement perdue |
| Analyse de composition de panier (quels types achetés ensemble, ex. "Beverage + Food") | §3 rapport agrégation | Granularité probablement **perdue** dans le modèle agrégé à la minute — question ouverte |
| Priorité à 3 niveaux pour résoudre le revenu d'un event (granular > wizard > individual, `ticketsScanned` manuel prioritaire) | §3 rapport agrégation | Règle de résolution multi-source jamais documentée côté actuel |
| Fenêtre temporelle : plusieurs events le même jour dans le même space (pas seulement multi-jours) | §2 rapport agrégation | À vérifier si `SpaceRevenueMinuteAgg` gère ce cas |
| Triangle de réparation `cost/unitCost/numberOfUnits` | §3 rapport taxonomie | Règle de cohérence réutilisable |
| Dédup MarketPrice sur 4 champs exacts (`supplierItem, supplier_id, unit, unitsPerPurchase, price`) | §3 rapport taxonomie | Règle précise, transférable telle quelle |
| Audit-trail des changements de **coût recette** (distinct de l'historique de prix de vente) | §3 rapport taxonomie | Concept absent des mémos actuels |
| Garde-fou "un event futur ne doit jamais avoir de ventes" (purge défensive + log) | §3 rapport algo | À vérifier côté NestJS |
| Règle "config live du builder gagne toujours sur un nom de mapping figé" | §3 rapport algo | Motif récurrent, à connaître |
| UX de sélection manuelle des events comparables (`selectedEventIds`) comme brique fondatrice avant le scoring automatique | §3 rapport algo | Explique la survivance du champ `selectedEventIds` dans `RestockStateDto` |
| Philosophie "ne jamais jeter une ligne pour donnée manquante, la marquer" (`unmapped`/`Uncategorized`) | §3 rapport algo | Confirme que c'est un choix de conception constant, pas un bug isolé |

## Bugs vivants trouvés DANS le prototype (rien à corriger, juste des leçons)

Deux classes de bug à surveiller dans le code actuel, car elles sont faciles à reproduire sans s'en
apercevoir :
1. **Suppression qui ne supprime rien mais répond succès** — clé de suppression mal reconstruite
   (format différent de la clé d'écriture), l'endpoint répond `{success:true}` sans avoir rien
   supprimé. Vu à 2 endroits différents dans le prototype.
2. **Endpoint bulk cassé par du code de debug ad hoc laissé dans un chemin partagé** — une variable
   jamais définie provoque un `ReferenceError` systématique sur `sales/process-event-timeline`.

**Leçon pour la revue de code actuelle** : vérifier qu'une opération de nettoyage/suppression
vérifie l'effet réel (compte avant/après) plutôt que de répondre 200 par défaut.

## Ce qui est mort, confirmé sans valeur de portage

Toute la couche KV (store clé-valeur générique, chunking manuel, cache à invalidation dispersée), le
système de background job/checkpoint (contournement de la limite 150s des Edge Functions), les
scripts migrate/repair/cleanup en cascade, l'ingestion CSV Odoo brute (`fnb_sales_raw`) — tout est
structurellement remplacé par Prisma/Postgres et n'a aucune valeur de portage. Détail dans les 4
rapports.
