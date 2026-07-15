# ADR-0004 — Adopter @prisma/adapter-pg pour supprimer le double-wrapping pgbouncer

- **Statut** : Accepté
- **Date** : 2026-07-05
- **Domaine** : Base de données / Performance

## Contexte

Le pooler Supabase (port 6543, `pgbouncer=true`) est déjà un pooler de connexions ; le driver
Prisma par défaut ajoutait par-dessus son propre wrapping, créant un double-pooling coûteux en
latence. Mesuré concrètement sur le state du builder : ~850ms avec le driver par défaut.

Alternative non retenue : garder le driver par défaut et optimiser ailleurs — écarté car la
latence mesurée pointait spécifiquement vers ce double-wrapping.

## Décision

Adopter `@prisma/adapter-pg`, qui supprime ce double-wrapping. Latence mesurée après adoption :
~128ms sur le même état du builder (~6-7x plus rapide).

## Conséquences

Gain de performance net et mesuré. **Retirer le flag/adapter isolément, sans ajuster le reste de la
configuration de connexion, casse la connexion** — ne pas désactiver `@prisma/adapter-pg` sans
revalider toute la chaîne `DATABASE_URL`/`DIRECT_URL`. Gestionnaire de paquets du projet : `pnpm`.

## Références

- `architecture/SUPABASE.md`
