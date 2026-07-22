# BUG-216 — Le badge de statut par événement ne distingue pas échec/skip de "jamais traité"

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:248-254`

## Symptôme

```html
<span class="spt-badge" :class="item.aggregationStatus === 'completed' ? 'spt-badge--green' : 'spt-badge--gray'">
```
Seul `completed` affiche "Agrégé" ; **tout le reste** (`pending`, `failed`, `skipped`) affiche le
même badge gris "Non traité". Combiné à BUG-215, un utilisateur qui traite un événement en échec
n'a aucun moyen — ni via le toast (dit "succès"), ni via le badge de ligne (dit "non traité", comme
un événement jamais tenté) — de savoir qu'il a réellement échoué.

## Cause racine

Classification binaire `completed`/sinon, aucune branche `failed`/`skipped`.

## Correction

Le badge de statut par ligne distingue désormais 4 états au lieu de 2 : `completed` (vert,
"Agrégé"), `failed` (rouge, `spt-badge--red`, nouvelle clé `intgTimelineStatusFailed` = "Échec"),
`skipped` (ambre, `spt-badge--amber`, nouvelle clé `intgTimelineStatusSkipped` = "Ignoré"), et
tout le reste — `pending`/undefined — (gris, "Non traité", inchangé). Les classes CSS
`spt-badge--red`/`spt-badge--amber` existaient déjà dans la feuille de style (utilisées
ailleurs) ; aucun changement CSS nécessaire.

## Risque de régression / à surveiller

Corréler avec BUG-215 (même racine côté toast) et BUG-217 (fenêtre de double-soumission après
timeout de poll — un utilisateur qui ne voit pas l'échec risque de re-cliquer "Traiter", exactement
le scénario que BUG-217 rend possible).

## Références

- BUG-215, BUG-217.
