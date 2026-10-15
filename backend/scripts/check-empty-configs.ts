/**
 * Contrôle (lecture seule) : configurations qui ont des PdV mais AUCUN article activé dans le
 * Space Menu (MenuAssignment.enabled). Une telle config donne « Aucun article disponible » dans
 * Event Predict (Adidas arena / Aix Arena, sept. 2026 : clonage sans copie des menus).
 *
 *   npx tsx scripts/check-empty-configs.ts            # exit 1 si au moins une config vide
 *
 * SELECT uniquement. Réparation : scripts/copy-config-menus.ts.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const rows = await prisma.$queryRaw<
    { space: string; config: string; configId: string; shops: bigint; events: bigint }[]
  >`
    SELECT s.name AS space, c.name AS config, c.id AS "configId",
           (SELECT count(*) FROM "ConfigurationElement" ce WHERE ce."configId" = c.id) AS shops,
           (SELECT count(*) FROM "Event" e WHERE e."configurationId" = c.id) AS events
    FROM "Config" c
    JOIN "Space" s ON s.id = c."spaceId"
    WHERE EXISTS (SELECT 1 FROM "ConfigurationElement" ce WHERE ce."configId" = c.id)
      AND NOT EXISTS (SELECT 1 FROM "MenuAssignment" m WHERE m."configId" = c.id AND m.enabled)
    ORDER BY s.name, c.name`;
  if (!rows.length) return console.log('OK : aucune configuration sans article.');
  console.log(`${rows.length} configuration(s) avec PdV mais sans article activé :\n`);
  for (const r of rows) {
    console.log(`${r.space} | ${r.config} (${r.configId}) | ${r.shops} PdV | ${r.events} event(s)`);
  }
  process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
