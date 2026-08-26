/// <reference types="node" />
/**
 * Backfill identité produit Stock (ADR-0006, chantier 377) — résout `itemKind`/`itemRefId`
 * pour les lignes `StockLevel`/`StockMovement`/`StockTransferLoss` créées AVANT la
 * double-écriture (logistics.service.ts). Purement additif : ne touche que les lignes où
 * `itemRefId IS NULL`, `itemKey` continue de fonctionner comme avant pour tout le monde.
 *
 * Idempotent : ré-exécutable sans effet de bord (les lignes déjà résolues sont ignorées).
 * Priorité de résolution identique à `resolveItemIdentitiesForKeys`
 * (marketPrice > ingredient > packaging > menuComponent > menuItem) — les lignes qui ne
 * matchent aucun nom restent orphelines (itemKind/itemRefId null), ce qui est le comportement
 * attendu pour un vrai article supprimé du catalogue depuis.
 *
 * npx tsx prisma/backfill-stock-item-identity.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resolveIdentitiesForTenant(
  tenantId: string,
  names: string[],
): Promise<Map<string, { itemKind: string; itemRefId: string }>> {
  const result = new Map<string, { itemKind: string; itemRefId: string }>();
  if (!names.length) return result;

  const [marketPrices, ingredients, packagings, components, menuItems] = await Promise.all([
    prisma.marketPrice.findMany({
      where: { tenantId, deletedAt: null, itemName: { in: names } },
      select: { id: true, itemName: true },
    }),
    prisma.ingredient.findMany({
      where: { tenantId, deletedAt: null, name: { in: names } },
      select: { id: true, name: true },
    }),
    prisma.packaging.findMany({
      where: { tenantId, deletedAt: null, name: { in: names } },
      select: { id: true, name: true },
    }),
    prisma.menuComponent.findMany({
      where: { tenantId, deletedAt: null, name: { in: names } },
      select: { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null, name: { in: names } },
      select: { id: true, name: true },
    }),
  ]);
  const setIfAbsent = <T extends { id: string }>(rows: T[], kind: string, nameOf: (r: T) => string) => {
    for (const r of rows) {
      const key = nameOf(r).trim();
      if (key && !result.has(key)) result.set(key, { itemKind: kind, itemRefId: r.id });
    }
  };
  setIfAbsent(marketPrices, 'marketPrice', (r) => r.itemName);
  setIfAbsent(ingredients, 'ingredient', (r) => r.name);
  setIfAbsent(packagings, 'packaging', (r) => r.name);
  setIfAbsent(components, 'menuComponent', (r) => r.name);
  setIfAbsent(menuItems, 'menuItem', (r) => r.name);
  return result;
}

/** Groupe les ids de lignes par (itemKind, itemRefId) résolus, pour un updateMany par groupe
 *  plutôt qu'un UPDATE par ligne — un event peut avoir des centaines de lignes StockMovement
 *  pour une poignée d'articles distincts. */
function groupByIdentity(
  rows: Array<{ id: string; itemKey: string }>,
  identities: Map<string, { itemKind: string; itemRefId: string }>,
) {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const identity = identities.get(String(row.itemKey ?? '').trim());
    if (!identity) continue;
    const key = `${identity.itemKind}|${identity.itemRefId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.id);
  }
  return groups;
}

async function backfillStockLevel(tenantId: string) {
  const rows = await prisma.stockLevel.findMany({
    where: { tenantId, itemRefId: null },
    select: { id: true, itemKey: true },
  });
  if (!rows.length) return { total: 0, resolved: 0 };
  const names = [...new Set(rows.map((r) => String(r.itemKey ?? '').trim()).filter(Boolean))];
  const identities = await resolveIdentitiesForTenant(tenantId, names);
  const groups = groupByIdentity(rows, identities);
  let resolved = 0;
  for (const [key, ids] of groups) {
    const [itemKind, itemRefId] = key.split('|');
    await prisma.stockLevel.updateMany({ where: { id: { in: ids } }, data: { itemKind, itemRefId } });
    resolved += ids.length;
  }
  console.log(`  StockLevel: ${resolved}/${rows.length} résolus`);
  return { total: rows.length, resolved };
}

async function backfillStockMovement(tenantId: string) {
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId, itemRefId: null },
    select: { id: true, itemKey: true },
  });
  if (!rows.length) return { total: 0, resolved: 0 };
  const names = [...new Set(rows.map((r) => String(r.itemKey ?? '').trim()).filter(Boolean))];
  const identities = await resolveIdentitiesForTenant(tenantId, names);
  const groups = groupByIdentity(rows, identities);
  let resolved = 0;
  for (const [key, ids] of groups) {
    const [itemKind, itemRefId] = key.split('|');
    await prisma.stockMovement.updateMany({ where: { id: { in: ids } }, data: { itemKind, itemRefId } });
    resolved += ids.length;
  }
  console.log(`  StockMovement: ${resolved}/${rows.length} résolus`);
  return { total: rows.length, resolved };
}

async function backfillStockTransferLoss(tenantId: string) {
  const rows = await prisma.stockTransferLoss.findMany({
    where: { tenantId, itemRefId: null },
    select: { id: true, itemKey: true },
  });
  if (!rows.length) return { total: 0, resolved: 0 };
  const names = [...new Set(rows.map((r) => String(r.itemKey ?? '').trim()).filter(Boolean))];
  const identities = await resolveIdentitiesForTenant(tenantId, names);
  const groups = groupByIdentity(rows, identities);
  let resolved = 0;
  for (const [key, ids] of groups) {
    const [itemKind, itemRefId] = key.split('|');
    await prisma.stockTransferLoss.updateMany({ where: { id: { in: ids } }, data: { itemKind, itemRefId } });
    resolved += ids.length;
  }
  console.log(`  StockTransferLoss: ${resolved}/${rows.length} résolus`);
  return { total: rows.length, resolved };
}

async function main() {
  console.log('🔧 Backfill identité produit Stock (ADR-0006, chantier 377) — début');
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`ℹ️  ${tenants.length} tenant(s) à traiter`);

  let grandTotal = 0;
  let grandResolved = 0;
  for (const tenant of tenants) {
    const [sl, sm, stl] = await Promise.all([
      backfillStockLevel(tenant.id),
      backfillStockMovement(tenant.id),
      backfillStockTransferLoss(tenant.id),
    ]);
    const tenantTotal = sl.total + sm.total + stl.total;
    if (tenantTotal) {
      console.log(`▸ Tenant ${tenant.name} (${tenant.id}) : ${sl.resolved + sm.resolved + stl.resolved}/${tenantTotal}`);
    }
    grandTotal += tenantTotal;
    grandResolved += sl.resolved + sm.resolved + stl.resolved;
  }
  console.log(
    `\n✅ Backfill terminé — ${grandResolved}/${grandTotal} lignes résolues ` +
      `(${grandTotal - grandResolved} orphelines : article renommé/supprimé depuis, itemKey continue de fonctionner comme avant).`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Backfill identité Stock — échec', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
