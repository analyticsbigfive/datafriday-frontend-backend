/**
 * Backfill BUG-331-02 (docs/bugs/) — pose `Event.weezeventEventId` pour les events créés via
 * "Créer et lier tout" (`bulkCreateEvents`, StepProcessTimeline.vue) AVANT le fix : ce flux
 * écrivait le lien uniquement dans `SalesEvent.metadata.dfEventId`, un champ non déclaré, jamais
 * relu par l'API — le VRAI champ typé (`Event.weezeventEventId`, celui que lit maintenant
 * `executeProcessEvents` pour le rattachement exact des transactions, BUG-330-02) restait `null`.
 *
 * Idempotent (ne touche que les `Event.weezeventEventId` encore `null`). DRY-RUN par défaut.
 *
 *   npx tsx scripts/backfill-event-weezevent-link.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-event-weezevent-link.ts --apply    # applique
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  // SalesEvent dont metadata.dfEventId est renseigné — l'ancien mécanisme de lien.
  const rows = await prisma.$queryRaw<Array<{ salesEventId: string; tenantId: string; dfEventId: string }>>`
    SELECT id AS "salesEventId", "tenantId", metadata->>'dfEventId' AS "dfEventId"
    FROM "WeezeventEvent"
    WHERE metadata->>'dfEventId' IS NOT NULL
  `;

  console.log(`SalesEvent avec dfEventId renseigné : ${rows.length}`);

  let matched = 0;
  let alreadyLinked = 0;
  let eventNotFound = 0;
  let tenantMismatch = 0;
  let toApply = 0;

  for (const row of rows) {
    const event = await prisma.event.findFirst({
      where: { id: row.dfEventId },
      select: { id: true, tenantId: true, weezeventEventId: true },
    });

    if (!event) {
      eventNotFound++;
      continue;
    }
    if (event.tenantId !== row.tenantId) {
      // Ne devrait jamais arriver (dfEventId posé par bulkCreateEvents dans le même tenant) —
      // garde de sécurité, signalé mais jamais appliqué.
      tenantMismatch++;
      console.warn(`  ⚠️  Event ${event.id} tenant=${event.tenantId} ≠ SalesEvent ${row.salesEventId} tenant=${row.tenantId} — ignoré`);
      continue;
    }
    if (event.weezeventEventId) {
      alreadyLinked++;
      continue;
    }

    matched++;
    toApply++;

    if (APPLY) {
      await prisma.event.update({
        where: { id: event.id },
        data: { weezeventEventId: row.salesEventId },
      });
    }
  }

  console.log(`Events à lier (weezeventEventId encore null) : ${matched}`);
  console.log(`Déjà liés (ignorés) : ${alreadyLinked}`);
  console.log(`dfEventId pointant vers un Event introuvable : ${eventNotFound}`);
  console.log(`Incohérence tenant (ignorés, à investiguer) : ${tenantMismatch}`);
  console.log(`\n${APPLY ? `✅ Backfill appliqué — ${toApply} Event(s) mis à jour.` : 'ℹ️  Relancez avec --apply pour exécuter.'}`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
