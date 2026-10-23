import { BrickKind, BrickSnapshotPoint, RecipeLine, ScopeArticle } from './cost-tracking.types';

/** Brique (ingrédient, emballage, composant) utilisée par au moins un article du périmètre. */
export interface ScopeBrick {
  kind: BrickKind;
  refId: string;
  name: string;
  /** Articles du périmètre dont la recette contient la brique. */
  articleIds: string[];
}

/** Brique du périmètre avec ses versions de coût sur la période et son fournisseur en vigueur. */
export interface ResolvedBrick extends ScopeBrick {
  /** Versions de la période (voir `CostTrackingBrickReaderService.readForPeriod`), vide si non lues. */
  versions: BrickSnapshotPoint[];
  /** Fournisseur de la dernière version, null si inconnu. */
  supplierKey: string | null;
  supplierName: string | null;
}

export const brickKey = (kind: BrickKind, refId: string) => `${kind}:${refId}`;

/** Nature de brique d'une ligne de recette ; null pour un fils de combo (un article, pas une brique). */
export function brickKindOfLine(kind: RecipeLine['kind']): BrickKind | null {
  return kind === 'ingredient' || kind === 'packaging' || kind === 'component' ? kind : null;
}

/** Nom de fournisseur comparable : sans accent, minuscule, espaces réduits. */
export function normalizeSupplierName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Clé de regroupement d'un fournisseur : son id, sinon `name:<nom normalisé>`, null si on ne sait rien. */
export function supplierKeyOf(supplierId: string | null | undefined, supplierName: string | null | undefined): string | null {
  if (supplierId) return supplierId;
  const normalized = normalizeSupplierName(supplierName);
  return normalized ? `name:${normalized}` : null;
}

/** Briques distinctes des recettes (clé : `kind:refId`), avec les articles qui les utilisent. Les fils de combo sont ignorés. */
export function collectRecipeBricks(recipes: Map<string, RecipeLine[]>): Map<string, ScopeBrick> {
  const out = new Map<string, ScopeBrick>();
  for (const [articleId, lines] of recipes) {
    for (const line of lines) {
      const kind = brickKindOfLine(line.kind);
      if (!kind) continue;
      const key = brickKey(kind, line.refId);
      const entry = out.get(key) ?? { kind, refId: line.refId, name: line.name ?? '', articleIds: [] };
      if (line.name) entry.name = line.name;
      if (!entry.articleIds.includes(articleId)) entry.articleIds.push(articleId);
      out.set(key, entry);
    }
  }
  return out;
}

/** Articles dont la recette contient le composant `componentId`. */
export function articlesWithComponent(recipes: Map<string, RecipeLine[]>, componentId: string): Set<string> {
  const ids = new Set<string>();
  for (const [articleId, lines] of recipes) {
    if (lines.some((l) => l.kind === 'component' && l.refId === componentId)) ids.add(articleId);
  }
  return ids;
}

/** Ajoute fournisseur en vigueur (dernière version) et versions à chaque brique. */
export function resolveBricks(bricks: Iterable<ScopeBrick>, versionsByBrick: Map<string, BrickSnapshotPoint[]>): ResolvedBrick[] {
  return [...bricks].map((b) => {
    const versions = versionsByBrick.get(brickKey(b.kind, b.refId)) ?? [];
    const last = versions[versions.length - 1];
    return {
      ...b,
      versions,
      supplierKey: last ? supplierKeyOf(last.supplierId, last.supplierName) : null,
      supplierName: last?.supplierName ?? null,
    };
  });
}

/** Articles (dans l'ordre fourni) qui utilisent au moins une des briques. */
export function articlesUsing(articles: ScopeArticle[], bricks: ScopeBrick[]): ScopeArticle[] {
  const used = new Set(bricks.flatMap((b) => b.articleIds));
  return articles.filter((a) => used.has(a.id));
}

export interface SupplierOption {
  key: string;
  name: string;
  brickCount: number;
}
