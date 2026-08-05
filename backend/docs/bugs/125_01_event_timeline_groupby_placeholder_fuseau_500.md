# BUG-125-01 — `getEventTimelineBatch` : 500 (42803) — le correctif fuseau BUG-270 duplique le paramètre timezone entre SELECT et GROUP BY

- **Statut** : 🟡 Corrigé non testé (correctif écrit sur `fix/bug-270-03-event-timeline-groupby-500`, en attente de PR/merge/déploiement)
- **Sévérité** : 🔴 Critique (toute la page Analyse ne charge plus en prod)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend (`datafriday-frontend-backend/backend`)
- **Découvert le** : 2026-08-03 (signalé par l'utilisateur : « Répartition du CA par article ne se charge plus », 500 sur `GET /spaces/:id/event-timeline` pour l'espace `cms8tqwty0004z90l0r7wi049`)
- **Fichiers** : `src/features/spaces/spaces.service.ts` — `getEventTimelineBatch` (SELECT `minute` + clause `GROUP BY` de la requête `$queryRaw`)
- **Lié à** : fiche frontend [BUG-270-02](../../../frontend/docs/bugs/270_02_analyse_timeline_heures_transactiondate_utc_brut_sans_conversion_fuseau.md) (le correctif fuseau dont ce bug est la régression), BUG-108 (même requête), BUG-124-01 (même endpoint, autre 500)

## Symptôme

Depuis le merge du correctif fuseau BUG-270 dans `develop` (merge `9b71b42`, déployé
automatiquement sur Render), `GET /spaces/:id/event-timeline?eventIds=...` renvoie **500** pour
tout espace et tout lot d'événements. Côté frontend, tout ce qui dépend de la timeline batch ne
charge plus (dont « Répartition du CA par article » / `MenuItemRevenueDistribution.vue`). Le donut
« Répartition des catégories de produits par transaction » (endpoint `transaction-baskets`)
continue de charger — voir « Pourquoi baskets survit » ci-dessous.

Logs Postgres du projet Supabase `datafriday-dev` (base derrière `datafriday-api.onrender.com`),
en boucle à chaque tentative de chargement :

```
ERROR: column "t.transactionDate" must appear in the GROUP BY clause or be used in an aggregate function
```

## Cause racine

Le correctif BUG-270 a introduit la conversion de fuseau dans l'expression `minute` :

```sql
TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}), 'HH24:MI')
```

et a répété la même expression dans le `GROUP BY`. Avant BUG-270, cette répétition était
inoffensive : l'expression ne contenait aucun paramètre, les deux textes SQL étaient identiques et
Postgres les appariait.

Avec `${spaceTimezone}`, **chaque interpolation `Prisma.sql` devient un placeholder distinct**
(`$2` dans le SELECT, `$5` dans le GROUP BY, la valeur liée étant la même). Or Postgres apparie
les expressions du GROUP BY avec celles du SELECT **au parse**, structurellement : il ne peut pas
prouver que `$2 = $5` (l'égalité des valeurs n'est connue qu'à l'exécution). Les deux
`DATE_TRUNC(...)` sont donc traités comme des expressions différentes → le SELECT contient une
colonne (`t."transactionDate"`) ni groupée ni agrégée → erreur `42803` → 500.

Mécanisme vérifié sur la base dev (avant l'arrêt des accès Supabase demandé par Jean-Luc) :

- `PREPARE p(text, text) AS SELECT TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE $1), 'HH24:MI'), COUNT(*) FROM "WeezeventTransaction" t GROUP BY DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE $2)`
  → reproduit exactement `42803: column "t.transactionDate" must appear in the GROUP BY clause`.
- La même requête avec l'expression factorisée en `CROSS JOIN LATERAL` et **un seul** placeholder
  → prépare et s'exécute sans erreur.

## Pourquoi `getTransactionBasketsBatch` survit au même doublon

`getTransactionBasketsBatch` porte exactement la même expression dupliquée (SELECT + GROUP BY de
sa CTE `tx`), mais son `GROUP BY` contient aussi `t.id` — la **clé primaire** de
`WeezeventTransaction`. Par dépendance fonctionnelle (PK dans le GROUP BY), Postgres accepte
toutes les colonnes `t.*` non groupées, mismatch de placeholders ou pas. C'est fragile (retirer
`t.id` du GROUP BY casserait la requête de la même façon), mais légal — non modifié ici,
volontairement chirurgical.

## Correction

`spaces.service.ts`, `getEventTimelineBatch` uniquement : l'expression de conversion est calculée
**une seule fois** dans un `CROSS JOIN LATERAL` :

```sql
CROSS JOIN LATERAL (
  SELECT DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}) AS "minuteLocal"
) tz
```

- SELECT : `TO_CHAR(tz."minuteLocal", 'HH24:MI') AS minute`
- GROUP BY : `tz."minuteLocal"`

Une seule occurrence de `${spaceTimezone}` → un seul placeholder → plus de mismatch. Sémantique
strictement identique à l'intention de BUG-270 : on groupe toujours sur le **timestamp** tronqué à
la minute (pas sur la chaîne `HH24:MI`), donc les événements multi-jours gardent une ligne par
jour × minute. Aucune migration, aucun autre fichier de code modifié.

## Leçon générique

Dans une requête `Prisma.sql`, **ne jamais répéter une expression paramétrée entre le SELECT et le
GROUP BY** : chaque interpolation devient un placeholder distinct que Postgres ne peut pas
apparier. Factoriser dans un `LATERAL` (ou une CTE), ou grouper sur la PK.

## Vérification

- [x] Erreur 42803 reproduite avec deux placeholders, forme LATERAL validée (base dev, 2026-08-03).
- [ ] `pnpm test` backend (`spaces.service.spec.ts`).
- [ ] Après merge + redéploiement Render : la page Analyse recharge, « Répartition du CA par
  article » s'affiche, les heures restent en fuseau local (BUG-270 toujours corrigé), plus aucune
  occurrence de 42803 dans les logs Postgres.

JLH
