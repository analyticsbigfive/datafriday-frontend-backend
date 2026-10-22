import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../core/database/prisma.service';

type UsagePrisma = Pick<
  PrismaService,
  'componentComponent' | 'componentIngredient' | 'menuItemComponent' | 'menuItemIngredient' | 'menuItemPackaging'
>;

const MAX_EXAMPLES = 5;

export interface BrickUsage {
  count: number;
  examples: string[];
}

const NOT_DELETED = { deletedAt: null };

/** Fusionne des listes de noms (dédoublonnés) et garde le total d'usages. */
function mergeUsage(parts: Array<{ count: number; names: string[] }>): BrickUsage {
  const names = new Set<string>();
  let count = 0;
  for (const part of parts) {
    count += part.count;
    part.names.forEach((n) => names.add(n));
  }
  return { count, examples: [...names].slice(0, MAX_EXAMPLES) };
}

/** Usages (non supprimés) d'un composant : comme enfant d'un autre composant, ou dans la recette d'un article. */
export async function getComponentUsage(prisma: UsagePrisma, componentId: string): Promise<BrickUsage> {
  const parentWhere = { childId: componentId, parent: NOT_DELETED };
  const itemWhere = { componentId, menuItem: NOT_DELETED };
  const [parentCount, parents, itemCount, items] = await Promise.all([
    prisma.componentComponent.count({ where: parentWhere }),
    prisma.componentComponent.findMany({ where: parentWhere, select: { parent: { select: { name: true } } }, take: MAX_EXAMPLES }),
    prisma.menuItemComponent.count({ where: itemWhere }),
    prisma.menuItemComponent.findMany({ where: itemWhere, select: { menuItem: { select: { name: true } } }, take: MAX_EXAMPLES }),
  ]);
  return mergeUsage([
    { count: parentCount, names: parents.map((p) => p.parent.name) },
    { count: itemCount, names: items.map((i) => i.menuItem.name) },
  ]);
}

/** Usages (non supprimés) d'un ingrédient : lignes de composant et d'article. */
export async function getIngredientUsage(prisma: UsagePrisma, ingredientId: string): Promise<BrickUsage> {
  const componentWhere = { ingredientId, component: NOT_DELETED };
  const itemWhere = { ingredientId, menuItem: NOT_DELETED };
  const [componentCount, components, itemCount, items] = await Promise.all([
    prisma.componentIngredient.count({ where: componentWhere }),
    prisma.componentIngredient.findMany({ where: componentWhere, select: { component: { select: { name: true } } }, take: MAX_EXAMPLES }),
    prisma.menuItemIngredient.count({ where: itemWhere }),
    prisma.menuItemIngredient.findMany({ where: itemWhere, select: { menuItem: { select: { name: true } } }, take: MAX_EXAMPLES }),
  ]);
  return mergeUsage([
    { count: componentCount, names: components.map((c) => c.component.name) },
    { count: itemCount, names: items.map((i) => i.menuItem.name) },
  ]);
}

/** Usages (non supprimés) d'un emballage : lignes d'article. */
export async function getPackagingUsage(prisma: UsagePrisma, packagingId: string): Promise<BrickUsage> {
  const where = { packagingId, menuItem: NOT_DELETED };
  const [count, items] = await Promise.all([
    prisma.menuItemPackaging.count({ where }),
    prisma.menuItemPackaging.findMany({ where, select: { menuItem: { select: { name: true } } }, take: MAX_EXAMPLES }),
  ]);
  return mergeUsage([{ count, names: items.map((i) => i.menuItem.name) }]);
}

/** Refuse la suppression (409) d'une brique encore utilisée. Sans effet si elle n'est pas utilisée. */
export function assertBrickUnused(usage: BrickUsage): void {
  if (usage.count === 0) return;
  throw new ConflictException(
    `Utilisé dans ${usage.count} élément(s) (exemples : ${usage.examples.join(', ')}) : retirez-le d'abord des recettes.`,
  );
}
