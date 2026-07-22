# BUG-198 — Dates et nombres toujours formatés en `fr-FR`, ignorent le switch de langue de l'app

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:1040-1052` (`formatDate`/`formatDateTime`),
  `:197,224,228,232,236` (`.toLocaleString('fr-FR')`)

## Symptôme

Le composant maintient `this.locale` (`en`/`fr`, piloté par `localStorage.getItem('appLocale')` et
l'événement `locale-changed`) et utilise `t(key)` partout dans le texte — mais chaque date
(`formatDate`/`formatDateTime`) et chaque nombre (`toLocaleString`) est codé en dur sur `'fr-FR'`.
Un utilisateur en locale anglaise voit quand même des dates `JJ/MM/AAAA` et des nombres groupés à
la française (`12 345`).

## Cause racine

`new Date(dateStr).toLocaleDateString('fr-FR', ...)` / `.toLocaleString('fr-FR')` ne lisent jamais
`this.locale`.

## Correction

Ajout d'un computed `localeTag()` dans `DataIntegrationView.vue` (`this.locale === 'fr' ? 'fr-FR' :
'en-US'`). `formatDate`/`formatDateTime` utilisent désormais `this.localeTag` au lieu de `'fr-FR'`
codé en dur. Les cinq `.toLocaleString('fr-FR')` du template (lignes ~197, 224, 228, 232, 236) ont
été remplacés par un nouveau helper `formatNumber(n)` (`n.toLocaleString(this.localeTag)`).

## Risque de régression / à surveiller

Vérifier l'affichage des montants/dates dans les deux locales après correction (formats de
séparateurs différents selon les navigateurs/OS).

## Références

- BUG-199 (dialog de suppression totalement non traduit — même écran, même classe de problème
  i18n).
