import type { Prisma } from '@prisma/client';

/**
 * Pure helpers backing PrismaService's automatic multi-tenant isolation.
 * Extracted from the service so they can be unit-tested without a DB.
 */

interface DmmfField {
  name: string;
  isRequired?: boolean;
  isList?: boolean;
  kind?: string;
}
interface DmmfModel {
  name: string;
  fields: DmmfField[];
}

/**
 * Build the set of model names eligible for automatic tenant scoping: those
 * carrying a REQUIRED scalar `tenantId`. Models with a nullable tenantId (e.g.
 * Permission, whose system-catalog rows have tenantId = null) are excluded.
 */
export function buildTenantScopedModelSet(models: readonly DmmfModel[]): Set<string> {
  return new Set(
    models
      .filter((model) =>
        model.fields.some(
          (field) =>
            field.name === 'tenantId' &&
            field.isRequired === true &&
            field.isList !== true &&
            field.kind === 'scalar',
        ),
      )
      .map((model) => model.name),
  );
}

/** Merge tenantId into a WHERE clause, never overriding an explicit one. */
export function mergeTenantWhere(where: any, tenantId: string): any {
  if (where && typeof where === 'object' && 'tenantId' in where) {
    return where; // caller already scoped — respect it
  }
  return { ...(where ?? {}), tenantId };
}

function setTenantOnData(data: any, tenantId: string): void {
  if (data && typeof data === 'object' && data.tenantId === undefined) {
    data.tenantId = tenantId;
  }
}

/**
 * Mutate `params.args` in place to constrain the query to `tenantId`.
 *
 * Relies on Prisma 5 "extended where unique": adding a `tenantId` scalar filter
 * alongside a unique selector is valid for findUnique/update/delete, so the
 * query action never needs to be rewritten.
 */
export function applyTenantScope(
  params: Prisma.MiddlewareParams,
  tenantId: string,
): void {
  const args = (params.args ?? {}) as Record<string, any>;

  switch (params.action) {
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany': {
      args.where = mergeTenantWhere(args.where, tenantId);
      break;
    }

    case 'upsert': {
      args.where = mergeTenantWhere(args.where, tenantId);
      if (args.create && typeof args.create === 'object') {
        args.create.tenantId = args.create.tenantId ?? tenantId;
      }
      break;
    }

    case 'create': {
      setTenantOnData(args.data, tenantId);
      break;
    }

    case 'createMany': {
      if (Array.isArray(args.data)) {
        args.data.forEach((row: any) => setTenantOnData(row, tenantId));
      } else {
        setTenantOnData(args.data, tenantId);
      }
      break;
    }

    default:
      break;
  }

  params.args = args;
}

export type TenantScopeDecision =
  | { kind: 'scope'; tenantId: string }
  | { kind: 'pass' }
  | { kind: 'reject' };

/**
 * Décide du sort d'une requête Prisma vis-à-vis de l'isolation tenant.
 *
 * - modèle non tenant-scopé : passe tel quel ;
 * - AUCUN contexte CLS (job, cron, script) : refus. Le code hors requête HTTP doit
 *   ouvrir un contexte explicite (TenantContextService.runForTenant ou
 *   runWithoutTenantScope), sinon une requête oublierait son filtre sans que rien
 *   ne le détecte ;
 * - contexte HTTP sans tenant (route publique, webhook) ou contournement explicite :
 *   passe (les guards protègent ces routes) ;
 * - sinon : la requête est restreinte au tenant du contexte.
 */
export function decideTenantScope(input: {
  model: string | undefined;
  scopedModels: Set<string>;
  hasContext: boolean;
  bypass: boolean;
  tenantId: string | undefined;
}): TenantScopeDecision {
  if (!input.model || !input.scopedModels.has(input.model)) return { kind: 'pass' };
  if (!input.hasContext) return { kind: 'reject' };
  if (input.bypass || !input.tenantId) return { kind: 'pass' };
  return { kind: 'scope', tenantId: input.tenantId };
}
