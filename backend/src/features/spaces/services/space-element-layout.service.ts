import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Éléments d'espace (PdV, stockages...) : création rapide, rattachement aux étages, zones,
 * parvis et merch extérieur, mise à jour et suppression.
 */

/**
 * Briques de placement des éléments : zones Builder v2, configuration cible, grille et géométrie.
 */
@Injectable()
export class SpaceElementLayoutService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(SpaceElementLayoutService.name);

  /**
   * Builder v2 : trouve/crée la Zone (spaceId, kind, level) — cible des assignations
   * Data Integration sur les espaces gérés en v2.
   */
  async ensureZone(
    spaceId: string,
    kind: 'FLOOR' | 'FORECOURT' | 'EXTERNAL',
    level: number,
    defaults: { name: string; width?: number; length?: number; height?: number },
  ) {
    const existing = await this.prisma.zone.findFirst({
      where: { spaceId, kind: kind as any, level },
    });
    if (existing) return existing;
    return this.prisma.zone.create({
      data: {
        spaceId,
        kind: kind as any,
        level,
        name: defaults.name,
        width: defaults.width ?? 200,
        length: defaults.length ?? 200,
        height: defaults.height ?? (kind === 'FLOOR' ? 4 : 0),
      },
    });
  }

  /**
   * Dimensions du dialogue « Assigner un étage » → patch de la Zone v2 cible.
   * `ensureZone` ne les applique qu'à la CRÉATION : sur une zone existante elles
   * étaient silencieusement perdues (le 3D Builder gardait les anciennes dimensions).
   */
  zoneDimensionsPatch(
    zone: { width: number | null; length: number | null; height: number | null },
    opts: { width?: number; length?: number; height?: number },
  ) {
    const patch: { width?: number; length?: number; height?: number } = {};
    if (opts.width !== undefined && opts.width !== zone.width) patch.width = opts.width;
    if (opts.length !== undefined && opts.length !== zone.length) patch.length = opts.length;
    if (opts.height !== undefined && opts.height !== zone.height) patch.height = opts.height;
    return patch;
  }

  /**
   * Résout la configuration cible des opérations d'assignation (quick-element, assign-floor,
   * forecourt, externalMerch) de l'étape 2 de l'intégration.
   *
   * Contrat STRICT (aucune création de config par défaut / « Weezevent Import », jamais) :
   *  1. `configId` explicite (config choisie au sélecteur d'étage / 3D Builder) → utilisée.
   *  2. Sinon, la config UTILISATEUR principale (la plus ancienne `isSystem = false`),
   *     c.-à-d. celle créée à l'étape 1 ou dans le 3D Builder.
   *  3. Sinon → erreur 400. On NE crée RIEN : pas de config « Weezevent Import », pas de
   *     config par défaut. L'utilisateur doit d'abord créer une config (étape 1 / 3D Builder).
   */
  async resolveTargetConfig(spaceId: string, configId?: string) {
    if (configId) {
      const explicit = await this.prisma.config.findFirst({
        where: { id: configId, spaceId, isSystem: false },
      });
      if (explicit) return explicit;
    }

    const userConfig = await this.prisma.config.findFirst({
      where: { spaceId, isSystem: false },
      orderBy: { createdAt: 'asc' },
    });
    if (userConfig) return userConfig;

    throw new BadRequestException(
      "Aucune configuration pour cet espace. Créez-en une à l'étape 1 ou dans le 3D Builder " +
        "avant d'assigner ou de créer des shops. (Aucune configuration « Weezevent Import » n'est créée.)",
    );
  }

  /**
   * Position en grille (en mètres) pour le `index`-ième shop d'une zone, afin d'éviter
   * que tous les shops importés s'empilent à l'origine. Pas de 10 m, en partant de (5,5).
   */
  gridPosition(index: number, areaWidth = 200): { x: number; y: number } {
    const STEP = 10;
    const MARGIN = 5;
    const cols = Math.max(1, Math.floor((areaWidth - MARGIN) / STEP));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: MARGIN + col * STEP, y: MARGIN + row * STEP };
  }

  /**
   * Géométrie (position en rangée + dimensions) à appliquer au `index`-ième élément
   * d'une assignation venant du dialogue « Assigner un étage » (étape 2). Les shops
   * sont posés côte à côte à partir de `position` (pas de `width + 1` m).
   */
  elementGeometryData(
    index: number,
    position?: { x: number; y: number },
    dims?: { width?: number; depth?: number; height?: number },
  ): Record<string, number> {
    const data: Record<string, number> = {};
    if (dims?.width != null) data.width = dims.width;
    if (dims?.depth != null) data.depth = dims.depth;
    if (dims?.height != null) {
      data.height = dims.height;
      data.height3d = dims.height;
    }
    if (position) {
      const w = dims?.width ?? 4;
      data.x = position.x + index * (w + 1);
      data.y = position.y;
    }
    return data;
  }

  /**
   * BUG-23 — Journalise la bascule v1→v2 lorsqu'un espace "v1 pur" route une assignation
   * en v2 uniquement parce qu'au moins une `Zone` existe déjà pour cet espace (ex. créée
   * par un `quick-element` antérieur). Purement observabilité : ne change AUCUN
   * comportement de routage, ne fait que rendre la bascule visible en log (cf.
   * docs/bugs/23_bascule_silencieuse_v1_v2_assign_floor.md).
   */
  logBuilderV2Switch(
    origin: 'assignElementsToFloorLevel' | 'assignElementsToForecourt' | 'assignElementsToExternalMerch',
    spaceId: string,
    tenantId: string,
    zoneCount: number,
  ): void {
    this.logger.warn(
      `[BUG-23] Bascule v1→v2 (builderVersion=v2) pour spaceId=${spaceId} tenantId=${tenantId} ` +
        `dans ${origin} : l'espace possède déjà ${zoneCount} zone(s), toute nouvelle assignation ` +
        `est routée en v2 même si l'utilisateur n'a jamais ouvert le builder v2.`,
    );
  }
}
