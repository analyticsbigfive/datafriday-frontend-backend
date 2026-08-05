# Merger `develop` dans ma branche de travail

Rappel : **on rapatrie `develop` AVANT de commencer à modifier du code**, pas après. Un merge sur
un working tree propre est trivial ; un merge après 3 jours de modifs non commitées ne l'est pas.

## En clair

Ta branche est une photo de `develop` prise le jour où tu l'as créée. Pendant ce temps, les autres
continuent à pousser sur `develop`. Plus tu attends, plus l'écart grandit, et plus le jour où il
faut recoller les deux ça fait mal.

Donc : chaque matin, avant d'ouvrir le premier fichier, tu récupères ce que les autres ont fait et
tu le fusionnes dans ta branche. 4 commandes, 10 secondes. Si tu le fais tous les jours, il n'y a
jamais de conflit sérieux. Si tu le fais une fois par semaine, tu passes une demi-journée à
démêler.

Et surtout : **on ne se met jamais sur `develop`**. On reste sur sa propre branche et on tire
`develop` vers soi.

---

## La séquence (à faire avant chaque session de modifications)

```bash
# 1. Vérifier que le working tree est propre — rien en cours, rien de non commité
git status

# 2. Récupérer l'état du serveur (ne modifie AUCUN fichier local)
git fetch origin

# 3. Vérifier qu'on est bien sur SA branche
git branch --show-current

# 4. Voir ce qui va arriver avant de merger
git log --oneline HEAD..origin/develop

# 5. Merger
git merge origin/develop
```

On merge `origin/develop` (la référence distante), **pas** la branche locale `develop` : la locale
peut être périmée, et surtout on n'a pas besoin de s'y positionner.

## Si le working tree n'est pas propre

```bash
git stash push -u -m "wip avant merge develop"
git fetch origin && git merge origin/develop
git stash pop
```

Ou, si le travail en cours est cohérent, le commiter d'abord — c'est plus sûr qu'un stash qu'on
oublie.

## En cas de conflit

```bash
# Voir les fichiers en conflit
git status

# ... résoudre à la main dans l'éditeur, puis :
git add <fichier-résolu>
git merge --continue

# Ou tout annuler et revenir à l'état d'avant le merge :
git merge --abort
```

`git merge --abort` ne marche que tant que le merge n'est pas commité. Après, c'est `git reset
--hard ORIG_HEAD` (destructif — vérifier `git status` avant).

## Pousser sa branche après le merge

```bash
git push origin fix/ma-branche
```

Puis PR. **Jamais de push direct sur `develop`.**

---

## Règles dures

- **Ne jamais faire `git checkout develop` / `git switch develop`.** Un push sur `develop`
  déclenche aujourd'hui un déploiement Cloudflare **en production**, sans suite de tests bloquante
  (voir [`frontend/CONTRIBUTING.md`](frontend/CONTRIBUTING.md) § Déploiement). Se positionner sur
  `develop` met à un `git push` réflexe de partir en prod sans revue. On reste sur sa branche.
- **Merge, jamais rebase**, dès que la branche a été poussée. `git rebase origin/develop` réécrit
  l'historique publié : ça casse la PR et le travail des autres si quelqu'un a tiré la branche.
- **`develop` ou `staging` ?** [`frontend/CONTRIBUTING.md`](frontend/CONTRIBUTING.md) § Workflow Git
  désigne `staging` comme base de travail actuelle et cible des PR ; `origin/staging` existe bien.
  Ce document donne les commandes pour `develop` comme demandé — **vérifier laquelle des deux est
  la base courante avant de merger**, et remplacer `origin/develop` par `origin/staging` le cas
  échéant. La séquence est identique.
- Seul le lead merge/pousse sur `staging` ou `develop`.

## Fréquence

| Quand | Quoi |
|---|---|
| Avant toute session de modifications | la séquence complète ci-dessus |
| Avant d'ouvrir une PR | re-merger `origin/develop` pour livrer une PR sans conflit |
| Après qu'une autre PR a été mergée | re-merger, surtout si elle touche les mêmes fichiers |

## Vérifier où on en est, sans rien modifier

```bash
git fetch origin
git log --oneline HEAD..origin/develop   # commits que develop a et que je n'ai pas → il faut merger
git log --oneline origin/develop..HEAD   # mes commits pas encore dans develop
```

Si la première commande ne renvoie rien : la branche est à jour, rien à faire.

---

JLH
