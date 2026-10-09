import type { PrismaClient } from '@prisma/client';

/**
 * Ce dont une fonction `*.queries.ts` a besoin pour exécuter du SQL brut : PrismaService
 * ou client de transaction (`tx`). Les requêtes brutes ne vivent que dans `*.queries.ts`
 * (règle ESLint) et prennent `tenantId` en premier paramètre métier.
 */
export type SqlClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
