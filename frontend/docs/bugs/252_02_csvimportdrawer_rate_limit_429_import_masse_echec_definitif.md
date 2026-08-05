# BUG-252-02 — Import CSV en masse : dépasse le palier "medium" du rate-limiter tenant (300 req/60s), toutes les lignes restantes échouent définitivement en 429

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web` (fix), `api-datafriday-staging` (cause racine, config
  existante non modifiée)
- **Découvert le** : 2026-07-28, résultat réel d'import fourni par l'utilisateur : 300 succès, 2
  doublons ignorés, **247 lignes en échec** — toutes avec le message
  "Trop de requêtes, réessayez plus tard." à partir de la ligne 302, sans exception, jusqu'à la
  fin du fichier (ligne 548).
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`doImport`,
  nouvelle méthode `createEventWithRateLimitRetry`), `src/api/client.js` (intercepteur 429,
  non modifié — cause du plafond de retry insuffisant), `backend/src/core/throttle/
  tenant-throttler.guard.ts` / `backend/src/app.module.ts` (config du rate-limiter, non modifiée)

## Symptôme

Un import CSV de 547 lignes réussit exactement les ~300 premières (créées en parallèle par lots de
`IMPORT_CONCURRENCY=5`), puis **toutes** les lignes suivantes échouent, une par une, avec
"Trop de requêtes, réessayez plus tard." — jusqu'à la fin du fichier. Aucune ne repasse au vert
plus tard dans le même import.

## Cause racine

Le rate-limiter backend (`TenantThrottlerGuard`, appliqué par tenant) a 3 paliers indépendants
(`.env` / défauts Joi dans `app.module.ts`) :
- **short** : 20 requêtes / 1 seconde
- **medium** : 300 requêtes / 60 secondes ← palier touché ici
- **long** : 5000 requêtes / 1 heure

Un import de plusieurs centaines de lignes en concurrence de 5 dépasse largement les 300 req/min
en quelques dizaines de secondes. Le backend renvoie alors un 429 avec un header `Retry-After`
(pouvant valoir jusqu'à ~60s pour ce palier). L'intercepteur Axios global
(`src/api/client.js`, lignes ~185-213) a bien un retry automatique sur 429, **mais plafonné à un
`Retry-After` ≤ 5 secondes** (`MAX_RETRY_WAIT_MS = 5000`) — un choix volontaire pour ne pas bloquer
un appel API interactif classique. Pour un `Retry-After` de 60s (typique une fois le palier
"medium" épuisé), ce plafond n'est jamais atteint : **aucun retry n'a lieu**, le 429 remonte tel
quel, et `CsvImportDrawer.doImport()` le traite comme un échec définitif pour cette ligne — d'où
les 247 échecs consécutifs, alors que les lignes elles-mêmes étaient parfaitement valides.

## Correction

Nouvelle méthode `createEventWithRateLimitRetry(payload, maxAttempts = 5)` dans
`CsvImportDrawer.vue`, utilisée à la place de l'appel direct `createEvent(payload)` dans la boucle
de création. Sur un 429, elle attend le `Retry-After` réel renvoyé par le serveur (plafonné à 90s
— couvre la fenêtre "medium" de 60s + marge ; au-delà, probablement le palier "long", pas la peine
de bloquer l'import une heure) puis retente, jusqu'à 5 tentatives par ligne. Un import CSV, à la
différence d'un appel interactif, peut se permettre d'attendre — ce nouveau retry est local à ce
composant, l'intercepteur Axios global n'est pas modifié (son plafond de 5s reste pertinent
partout ailleurs dans l'app).

## Risque de régression / à surveiller

- **Effet de bord attendu, pas un bug** : un import qui dépasse 300 lignes va maintenant marquer
  un ou plusieurs "temps d'arrêt" d'environ une minute pendant lesquels le compteur de progression
  (BUG-246-02) semble figé — le compteur `importedCount` de la ligne concernée ne s'incrémente
  qu'une fois le retry résolu (succès ou échec final), pas pendant l'attente elle-même. À
  documenter/afficher plus tard si ça reste source de confusion (ex. message "Limite de débit
  atteinte, reprise dans Xs…"), non fait dans ce correctif pour rester scopé au blocage.
- N'a pas touché la configuration du rate-limiter backend (délibéré — c'est une protection
  anti-abus légitime à l'échelle tenant, pas un bug ; le fix est côté client, pas côté limite).
- `@vue/compiler-sfc` + `@babel/core` propres, suite `pnpm test:unit` ciblée (94 tests) verte.
- Non exécuté en navigateur avec un vrai fichier > 300 lignes — à confirmer par l'utilisateur que
  l'import complet des 547 lignes va au bout cette fois (avec une pause d'environ une minute autour
  de la 300ᵉ ligne, visible dans les devtools réseau via des 429 suivis de succès).
- 300 events de test issus de l'import partiel documenté ici ont été supprimés à la demande de
  l'utilisateur avant ce fix (cf. session) — à reconfirmer avant un nouvel essai complet.

### Addendum 2026-07-31 — confirmation que le retry n'élimine pas tous les échecs consécutifs

Nouveau résultat d'import fourni par l'utilisateur : 10 lignes non importées, dont un bloc de 9
lignes **consécutives** (503 à 511) en "Trop de requêtes, réessayez plus tard.", malgré le retry
livré ci-dessus. Confirme ce que "Risque de régression" annonçait déjà de façon implicite : le
retry est **par ligne**, pas coordonné entre les paquets de `IMPORT_CONCURRENCY = 5` lancés en
parallèle. Quand un paquet de 5 est throttlé, ses 5 lignes retentent ensemble et peuvent retomber
ensemble juste au moment où la fenêtre "medium" (300 req/60s) se réinitialise, la reconsommant
aussitôt avant que les paquets suivants passent — un bloc de plusieurs lignes peut donc épuiser ses
5 tentatives avant qu'une fenêtre propre ne s'ouvre pour lui. **Non corrigé dans cette session** :
au même titre que la décision initiale ci-dessus, changer la concurrence ou ajouter un backoff
partagé entre paquets modifierait le comportement de l'import (temps total, ordre des requêtes) et
mérite une validation explicite plutôt qu'un fix silencieux — voir
`docs/bugs/258_02_csvimportdrawer_doublon_ignore_compte_comme_erreur.md` pour le bug distinct
(classification doublon/erreur) trouvé dans le même relevé et corrigé, lui, dans cette session.

## Références

- [[246_02_csvimportdrawer_import_sequentiel_lent_sans_progression]] — introduit la concurrence
  par lots qui, combinée au volume réel du fichier (547 lignes), a rendu ce plafond de rate-limit
  atteignable en pratique.
