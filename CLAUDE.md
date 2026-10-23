# Règles de travail multi-agents

S'appliquent à toutes les tâches, pour l'agent principal comme pour les sous-agents.

## Agents
- Modèles : Sonnet ou Haiku pour les sous-agents.
- Budget de contexte par session d'agent : alerte à 130k tokens, arrêt à 150k maximum.
  À 130k : finir proprement, écrire un résumé de passation, ne rien démarrer de neuf.
  À 150k : arrêt immédiat. Un agent neuf reprend avec le résumé (relais).
- Surveillance : `python3 scripts/agent-token-watch.py` (vérifie toutes les 20 s, signale WARN/STOP).
  L'agent principal le lance avec Monitor avant de déléguer.
- L'agent principal planifie d'abord, puis délègue. Tâches découpées pour tenir sous 130k.

## Branches et merge
- Chaque tâche : une branche et un worktree dédiés.
- L'agent finit et s'arrête. L'agent principal vérifie le diff et les tests, puis merge sur develop (local).
- Jamais de push, ni de merge vers staging ou production, sans go explicite et récent de l'utilisateur.
- Jamais de commit sans demande explicite de l'utilisateur.

## Tests
- Tests légers : autorisés en parallèle, plusieurs agents.
- Test lourd (jest, vue-cli-service) : uniquement via `scripts/test-serial.sh <backend|frontend> <un fichier spec>`.
  Un seul à la fois sur la machine, et seulement si plus de 1 Go de RAM est disponible.
  Jamais un dossier entier, jamais en parallèle.
