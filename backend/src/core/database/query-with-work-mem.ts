import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/** Mémoire de tri allouée aux lectures analytiques lourdes (paniers, timeline) : 32 Mo tiennent les
 *  tris mesurés (10 Mo pour 15 events) en mémoire au lieu de déborder sur disque avec les 5 Mo
 *  par défaut (2026-09-21 : 15 events, 4,3 s → 3,3 s). Le sémaphore analyse-batch borne à 2 la
 *  concurrence de ces requêtes, donc l'enveloppe mémoire côté Postgres reste connue. */
const ANALYSE_WORK_MEM = '32MB';

/**
 * Exécute `sql` avec un `work_mem` dédié, dans une transaction courte : `SET LOCAL` ne survit pas
 * à la transaction, ce qui est exactement ce qu'il faut derrière un pooler en mode transaction
 * (pgbouncer/Supabase) où la connexion est rendue à la fin.
 */
export function queryWithWorkMem<T = unknown>(prisma: PrismaService, sql: Prisma.Sql, workMem = ANALYSE_WORK_MEM): Promise<T> {
  // `SET` n'accepte pas de paramètre lié : la valeur est interpolée, donc validée strictement.
  if (!/^\d{1,4}(kB|MB)$/.test(workMem)) throw new InternalServerErrorException(`work_mem invalide : ${workMem}`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL work_mem = '${workMem}'`);
    return tx.$queryRaw<T>(sql);
  }) as Promise<T>;
}
