# BUG-NNN — Titre court et descriptif

- **Statut** : 🔴 Ouvert | 🟡 Corrigé non déployé | 🟢 Corrigé | ⚪ Diagnostiqué (root cause connue, fix à faire) | ⚫ Won't fix
- **Sévérité** : 🔴 Bloquant/impact business | 🟠 Majeur | 🟡 Mineur
- **Domaine** : (module métier concerné — voir `../CARTOGRAPHIE_MODULES.md` côté front, ou le module NestJS concerné)
- **Repo(s) concerné(s)** : `api-datafriday-staging` | `datafriday-web` | les deux
- **Découvert le** : YYYY-MM-DD
- **Fichiers** : `chemin/fichier.ts:ligne` (si connu)

## Symptôme

Ce qu'on observe concrètement — côté utilisateur, côté données, ou dans les logs. Donner un cas de
reproduction si possible.

## Cause racine

Pourquoi ça arrive. Citer fichier:ligne quand c'est identifié. Si la cause n'est pas encore
trouvée, dire explicitement "cause racine non identifiée".

## Correction

Ce qui a été fait (commit/branche/PR si connu), ou ce qu'il reste à faire. Si le bug est
volontairement non corrigé, préciser qui a décidé et pourquoi (arbitrage priorité/risque/effort).

## Risque de régression / à surveiller

Ce qu'il faut vérifier après le fix pour être sûr que ça ne revient pas (test ajouté ? endroit à
retester manuellement ? migration/backfill nécessaire sur les données déjà affectées ?).

## Références

- Lien vers doc de module, PR, autre bug lié (même repo ou repo miroir).

---

**Convention** : un fichier par bug, numéroté `NN_slug-court.md` (voir `00_INDEX.md` pour l'ordre).
Ne pas supprimer une fiche une fois le bug corrigé — mettre à jour le statut à 🟢 et laisser
l'historique : c'est ce qui évite de refaire deux fois le même diagnostic.
