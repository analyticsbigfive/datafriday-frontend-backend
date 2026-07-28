# BUG-031 — Restock : rôles "Technicien Logistic"/"PDV Superviseur" en 403 silencieux permanent

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Bloquant — perte silencieuse de travail
- **Domaine** : Stock (Réarmement)
- **Repo(s) concerné(s)** : les deux (backend = cause racine, frontend = symptôme avalé sans toast — voir mirror `datafriday-web/docs/bugs/19_restock_403_silencieux_front.md`)
- **Découvert le** : 2026-07-15
- **Fichiers** : `restock-state.controller.ts:44,67`, `permission-catalog.ts:145-156`

## Symptôme

Se connecter avec le rôle "Technicien Logistic" (ou "PDV Superviseur") → ouvrir
`/spaces/:id/restock` → modifier n'importe quel ajustement de stock → observer l'onglet réseau :
chaque `PUT /spaces/:id/restock-state` répond **403**, aucun toast ni bandeau d'erreur n'apparaît.
L'état est persisté en `localStorage` (donc "semble" fonctionner sur la même machine/navigateur)
mais ne traverse jamais vers l'API : changement de poste, de navigateur ou purge du cache = perte
silencieuse de tout le travail de réarmement de ce rôle.

## Cause racine

Deux rôles métier réels portent la permission `front.fb.restockBoard` **sans** `front.fb.restock`
(Technicien Logistic : `['nav.spaces', 'front.fb.restockBoard']` ; PDV Superviseur : idem +
`front.fb.spaceInventory`). Le frontend accepte les deux permissions en OR pour ouvrir l'écran et
éditer (aucun gating différencié dans l'UI). Mais `RestockStateController` gate différemment par
verbe : `@Get()` accepte les deux permissions, tandis que `@Put()`/`@Delete()` exigent
**exclusivement** `front.fb.restock` — `restockBoard` seul ne suffit pas. Le front avale l'erreur
du PUT silencieusement et ne bascule le flag "API down" que sur une erreur non-4xx — un 403 reste
donc considéré comme "API joignable" et retente à chaque frappe, indéfiniment, sans jamais prévenir
l'utilisateur.

## Correction

**Partielle (2026-07-18, côté front)** : le volet « erreur avalée » est corrigé — un 401/403 sur le
`PUT` déclenche désormais un snackbar explicite (une fois par session) : « Sauvegarde serveur
refusée (droits insuffisants)… » (cf. fiche miroir front BUG-019, mise à jour). L'utilisateur des
rôles concernés SAIT désormais que son travail ne traverse pas.

**Le fond (permissions backend) reste à trancher** — deux options produit incompatibles :
élargir `RequirePermissions` du `PUT`/`DELETE` à (`front.fb.restock`, `front.fb.restockBoard`) si
`restockBoard` doit pouvoir éditer (ce que son usage réel suggère), ou distinguer le rôle
("Tableau de Réarmement" = lecture seule) et gater le front en conséquence. Question posée dans
`docs/QUESTIONS_A_BERTRAND.md` (2026-07-18) — non tranché unilatéralement (règle projet).

## Risque de régression / à surveiller

C'est une perte de données silencieuse en prod pour ces deux rôles — priorité haute. Une fois
corrigé, vérifier aussi le volet front (gestion d'erreur qui doit alerter sur un 403, pas seulement
sur du non-4xx).

## Références

- `datafriday-web/docs/modules/06_STOCK_INVENTAIRE.md` §"Piège n°3 (bug actif confirmé)"
