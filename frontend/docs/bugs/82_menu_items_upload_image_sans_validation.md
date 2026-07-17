# BUG-082 — MenuItemCreateView : aucune validation de taille/type sur l'upload d'image

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:1268-1279`

## Symptôme

`onFileSelected` convertit directement n'importe quel fichier sélectionné en base64 et le stocke
dans `form.picturePreview`/`form.picture`, sans vérifier la taille. Un fichier lourd (photo brute
de smartphone, 8-15 Mo) alourdit fortement le payload JSON envoyé au backend sans aucun garde-fou.

## Cause racine

`accept="image/*"` est un filtre du sélecteur système, pas une validation réelle — aucun contrôle
de taille en JS avant la conversion base64.

## Correction

Ajout d'une limite de taille (5 Mo) vérifiée avant conversion, avec message d'erreur clair si
dépassée. Pas de compression/redimensionnement côté client ajouté (hors scope de ce fix,
nécessiterait une librairie dédiée).

## Risque de régression / à surveiller

Vérifier que la limite choisie (5 Mo) n'est pas trop basse pour les cas d'usage réels — ajuster si
des utilisateurs légitimes se retrouvent bloqués.

## Références

- Aucune.
