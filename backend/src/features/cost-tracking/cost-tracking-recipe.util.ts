import { RecipeLine } from './cost-tracking.types';

/** Lit le Json `recipe` d'un snapshot d'article ; ignore les lignes mal formées. */
export function parseRecipe(value: unknown): RecipeLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l: any) => l && typeof l.refId === 'string' && typeof l.kind === 'string')
    .map((l: any) => ({
      kind: l.kind,
      refId: l.refId,
      name: l.name ?? null,
      quantity: Number(l.quantity) || 0,
      unitCost: l.unitCost == null ? null : Number(l.unitCost),
    }));
}
