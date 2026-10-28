import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { assertKnownKind, validateLayoutForKind } from './report-layout.validation';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export interface ReportLayoutResult {
  layout: unknown;
  version: number;
}

const EMPTY_LAYOUT = { version: 1, slots: [] };

/** Mise en page de rapport par espace, avec verrou optimiste sur `version`. */
@Injectable()
export class ReportLayoutService {
  constructor(private readonly prisma: PrismaService, private readonly spaceAccess: SpaceAccessService) {}

  async get(tenantId: string, spaceId: string, kind: string, user?: SpaceScopedUser): Promise<ReportLayoutResult> {
    assertKnownKind(kind);
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);
    const row = await this.prisma.spaceReportLayout.findUnique({ where: { spaceId_kind: { spaceId, kind } } });
    return row ? { layout: row.layout, version: row.version } : { layout: { ...EMPTY_LAYOUT, slots: [] }, version: 0 };
  }

  async save(
    tenantId: string, spaceId: string, kind: string, layout: unknown, version: number, user?: SpaceScopedUser,
  ): Promise<ReportLayoutResult> {
    validateLayoutForKind(kind, layout);
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);
    const stale = () => new ConflictException('La mise en page a été modifiée par un autre utilisateur. Rechargez puis réessayez.');

    if (version === 0) {
      try {
        const created = await this.prisma.spaceReportLayout.create({
          data: { tenantId, spaceId, kind, layout: layout as Prisma.InputJsonValue, version: 1, updatedById: user?.id ?? null },
        });
        return { layout: created.layout, version: created.version };
      } catch (e) {
        if ((e as any)?.code === 'P2002') throw stale();
        throw e;
      }
    }

    // Mise à jour conditionnelle : atomique, le count 0 signale une version périmée.
    const { count } = await this.prisma.spaceReportLayout.updateMany({
      where: { tenantId, spaceId, kind, version },
      data: { layout: layout as Prisma.InputJsonValue, version: version + 1, updatedById: user?.id ?? null },
    });
    if (count === 0) throw stale();
    return { layout, version: version + 1 };
  }
}
