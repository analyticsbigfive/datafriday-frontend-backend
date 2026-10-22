import type { PrismaService } from '../../core/database/prisma.service';

type AncestryPrisma = Pick<PrismaService, 'componentComponent' | 'menuItemCombo'>;

/** Composants donnés + tous leurs parents (sous-composants), niveau par niveau. */
export async function withAncestorComponents(prisma: AncestryPrisma, seed: string[]): Promise<string[]> {
  const all = new Set(seed);
  let pending = [...all];
  while (pending.length) {
    // eslint-disable-next-line no-await-in-loop -- une requête par niveau de parents
    const parents = await prisma.componentComponent.findMany({
      where: { childId: { in: pending } },
      select: { parentId: true },
    });
    pending = parents.map((p) => p.parentId).filter((id) => !all.has(id));
    pending.forEach((id) => all.add(id));
  }
  return [...all];
}

/** Menu items donnés + tous leurs parents de combo, niveau par niveau. */
export async function withAncestorItems(prisma: AncestryPrisma, seed: string[]): Promise<string[]> {
  const all = new Set(seed);
  let pending = [...all];
  while (pending.length) {
    // eslint-disable-next-line no-await-in-loop -- une requête par niveau de combos
    const parents = await prisma.menuItemCombo.findMany({
      where: { childId: { in: pending } },
      select: { parentId: true },
    });
    pending = parents.map((p) => p.parentId).filter((id) => !all.has(id));
    pending.forEach((id) => all.add(id));
  }
  return [...all];
}
