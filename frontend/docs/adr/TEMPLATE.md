# ADR-NNN — Titre de la décision (verbe à l'infinitif : "Adopter X", "Remplacer Y par Z")

- **Statut** : Proposé | Accepté | Remplacé par ADR-XXX | Obsolète
- **Date** : YYYY-MM-DD
- **Domaine** : (module ou sujet transverse concerné)

## Contexte

Quel problème ou contrainte a mené à se poser la question. Citer les alternatives sérieusement
envisagées **si elles sont réellement connues** — ne jamais en inventer a posteriori pour faire
joli. Si on ne sait pas ce qui a été écarté, dire "alternatives non documentées".

## Décision

Ce qui a été choisi, en une ou deux phrases claires et vérifiables (pas d'ambiguïté possible).

## Conséquences

Ce que ça permet, ce que ça interdit ou complique, la dette technique assumée consciemment. C'est
la partie la plus utile pour un futur dev/agent : qu'est-ce qu'il ne faut PLUS faire à cause de
cette décision.

## Références

- Doc(s) source, commit/PR, autre ADR lié.

---

**Convention** : un fichier par décision, `NNNN_slug-court.md`, jamais supprimé. Si la décision est
renversée, ne pas éditer l'ancien ADR en douce — en créer un nouveau qui la remplace explicitement
et mettre à jour le statut de l'ancien à "Remplacé par ADR-XXX". Une ADR se justifie quand la
décision est structurante (modèle de données, découpage de modules, choix d'infra, convention de
déploiement) — pas pour un simple choix d'implémentation local.
