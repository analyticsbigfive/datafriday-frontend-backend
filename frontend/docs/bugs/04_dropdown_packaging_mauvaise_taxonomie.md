# BUG-004 — Dropdown packaging Market Price sur la mauvaise taxonomie + crash silencieux

- **Statut** : 🟡 Corrigé (code), non testé navigateur
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Market Price)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-07

## Symptôme

Le dropdown packaging des formulaires Create/Edit Supplier lisait et écrivait dans la taxonomie
**Menu Item** au lieu de la taxonomie **Market Price**. En Edit, un import manquant provoquait en
plus un crash silencieux (écran figé, aucune erreur visible à l'utilisateur).

## Cause racine

Réutilisation par erreur des endpoints/store de taxonomie Menu Item dans les formulaires Supplier ;
import manquant introduit lors d'un refactor précédent.

## Correction

Dropdown repointé sur la bonne taxonomie Market Price, import corrigé. **Non testé en navigateur**
— à valider avant tout déploiement.

## Risque de régression / à surveiller

Tester Create ET Edit Supplier : vérifier l'absence d'erreur console et la bonne persistance du
packaging choisi.

## Références

- `api-datafriday-staging/docs/bugs/03_taxonomie_croisee_marketprice_menuitem.md`
