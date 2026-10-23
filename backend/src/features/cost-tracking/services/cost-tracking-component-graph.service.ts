import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ComponentNode } from '../../analyse/recipe-breakdown';
import { ComponentLeaf, componentLeaves } from '../cost-tracking-component-leaves.util';

const MAX_DEPTH = 6;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/** Composition ACTUELLE des composants (aucun historique de composition n'existe), dépliée en ingrédients. */
@Injectable()
export class CostTrackingComponentGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ingrédients porteurs de chaque composant demandé (clé : componentId), sous-composants dépliés niveau par niveau. */
  async leavesFor(componentIds: string[]): Promise<Map<string, ComponentLeaf[]>> {
    const nodes = new Map<string, ComponentNode>();
    let frontier = [...new Set(componentIds.filter(Boolean))];
    for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
      // eslint-disable-next-line no-await-in-loop -- un niveau de profondeur par requête
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: frontier } },
        select: {
          id: true,
          unitCost: true,
          ingredients: { select: { quantity: true, ingredientId: true, ingredient: { select: { costPerRecipeUnit: true } } } },
          children: { select: { childId: true, quantity: true } },
        },
      });
      const next = new Set<string>();
      for (const r of rows) {
        nodes.set(r.id, {
          unitCost: num(r.unitCost),
          // `partner.supplierId` porte l'id de l'ingrédient (voir componentLeaves).
          ingredients: r.ingredients.map((l) => ({
            quantity: num(l.quantity),
            ingredient: { costPerRecipeUnit: num(l.ingredient?.costPerRecipeUnit), partner: { supplierId: l.ingredientId, supplierName: null, industrialId: null } },
          })),
          children: r.children.map((c) => ({ quantity: num(c.quantity), childId: c.childId })),
        });
        for (const c of r.children) if (!nodes.has(c.childId)) next.add(c.childId);
      }
      frontier = [...next];
    }
    const out = new Map<string, ComponentLeaf[]>();
    for (const id of new Set(componentIds)) if (nodes.has(id)) out.set(id, componentLeaves(id, nodes));
    return out;
  }
}
