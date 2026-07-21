# BUG-201 — Props à double majuscule (`onOpenHR`, `onOpenFBIntegration`) : la liaison kebab-case ne matche jamais, câblage silencieusement mort

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (une entrée de navigation entière sans effet, sans aucune erreur)
- **Domaine** : RH / Navigation (SpacesOverview → Settings)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-21 (en branchant « Edit HR », branche `feat/postEventInventory`)
- **Fichiers** : `src/views/SpacesOverviewView.vue:13,15` (liaisons fautives historiques), `src/components/SpacesPage.vue:1135` (prop `onOpenHR`), `src/components/hr/views/HrView.vue` (liaison correcte commentée)

## Symptôme

Cliquer « Edit HR » → « Suppliers »/« Positions » dans le panneau Settings ne faisait rien. Même
après avoir remplacé le `noop` de `SpacesOverviewView` par un vrai handler, **tant que la liaison
restait écrite en kebab-case** (`:on-open-hr="onOpenHR"`), le handler n'arrivait jamais jusqu'à
`SettingsMenu` : `this.onOpenHR` restait `undefined` et `handleOpenHR` (SettingsMenu.vue:743-744,
`this.onOpenHR?.(view)`) avalait le clic sans erreur ni warning console.

## Cause racine

Résolution des props par Vue 3 : l'attribut du template est **camelisé** puis comparé au nom
déclaré. Pour une prop contenant **deux majuscules consécutives** :

- déclarée : `onOpenHR` (SpacesPage.vue:1135, SettingsMenu.vue:618, ConsolidatedHRView.vue:181)
- écrite `:on-open-hr` → `camelize('on-open-hr')` = `onOpenHr` ≠ `onOpenHR` → **aucun match**, la
  valeur part en attribut fallthrough, la prop garde sa valeur par défaut (`null`).

La forme kebab correcte serait l'illisible `:on-open-h-r` (hyphenate('onOpenHR') = 'on-open-h-r').
Même piège pour `onOpenFBIntegration` (`:on-open-fb-integration` → `onOpenFbIntegration`).
Les props à majuscule simple (`onOpenEvents`, `onEditSpaceFromSettings`…) ne sont pas affectées —
c'est ce qui rendait le trou invisible : toutes les liaisons voisines du même bloc fonctionnaient.

Historique : `SpacesOverviewView` liait `:on-open-hr="noop"` — doublement mort (liaison qui ne
matche pas + valeur noop), donc jamais détecté tant que la feature restait `noop`.

## Correction

Sur `feat/postEventInventory` (2026-07-21) — liaisons passées en **camelCase**, seule forme sûre
pour ces props (et déjà la convention de fait : SpacesPage.vue:99,113 et
ConsolidatedAccountView.vue:47 lient `:onOpenHR` en camel) :

- `src/views/SpacesOverviewView.vue` : `:onOpenHR="onOpenHR"` (vrai handler → `/hr?tab=…`) et
  `:onOpenFBIntegration="noop"` (hygiène : la valeur reste noop, mais la liaison ne piégera plus
  personne le jour où elle sera branchée).
- `src/components/hr/views/HrView.vue` : liaison `:onOpenHR` avec commentaire expliquant le piège.

Règle à retenir : **toute prop dont le nom contient deux majuscules consécutives doit être liée en
camelCase dans les templates SFC** — ne jamais la kebabiser.

## Risque de régression / à surveiller

- Rechercher les nouvelles occurrences avant merge : `grep -rn ":on-open-hr\|:on-open-fb-integration" src/`
  doit rester vide.
- Si de nouvelles props multi-majuscules apparaissent (`…HT`, `…POS`, `…RH`…), préférer les
  renommer sans double majuscule (`onOpenHr`) ou documenter la liaison camelCase.
- Tester en navigateur : Settings → Edit HR → Suppliers/Positions ouvre `/hr` (fiche module
  [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §5).

## Références

- [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §2 (contexte du branchement)
- [BUG-202](202_consolidated_views_double_navigation_onclose.md) (second piège découvert au même branchement)

---

Rédaction : JLH, 2026-07-21.
