import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DashboardQueryDto, DashboardResponseDto, DashboardMetaDto, SpaceInfoDto, DashboardInclude, DashboardGranularity } from '../dto';
import { createHash } from 'crypto';
import { SpaceDashboardSectionsService } from './space-dashboard-sections.service';

/**
 * Tableau de bord d'un espace : assemblage des sections, période, métadonnées et cache versionné.
 */
@Injectable()
export class SpaceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceDashboardSectionsService: SpaceDashboardSectionsService,
  ) {}

  private readonly logger = new Logger(SpaceDashboardService.name);
  private readonly CACHE_TTL = 120; // 2 minutes
  private readonly CACHE_PREFIX = 'dash:v1';

  async getDashboard(
    spaceId: string,
    tenantId: string,
    query: DashboardQueryDto,
  ): Promise<DashboardResponseDto> {
    const startTime = Date.now();

    // Verify space belongs to tenant
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      include: { configs: true },
    });

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    // Get dashboard version for cache key
    const version = await this.getDashboardVersion(spaceId, tenantId);

    // Build cache key
    const cacheKey = this.buildCacheKey(
      tenantId,
      spaceId,
      query,
      version.version,
    );

    // Try to get from cache
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(
        `Cache hit for space ${spaceId} (${Date.now() - startTime}ms)`,
      );
      return cached;
    }

    // Cache miss - compute dashboard
    this.logger.log(`Cache miss for space ${spaceId}, computing...`);

    const { from, to } = this.getDateRange(query);
    const include = query.include || [];

    const response: DashboardResponseDto = {
      meta: this.buildMeta(
        spaceId,
        tenantId,
        from,
        to,
        query,
        version.version,
        false,
      ),
    };

    // Build response based on include parameter
    if (include.includes(DashboardInclude.SPACE)) {
      response.space = this.buildSpaceInfo(space);
    }

    if (include.includes(DashboardInclude.FILTERS)) {
      response.filters = await this.spaceDashboardSectionsService.getFilters(spaceId, tenantId, from, to);
    }

    if (include.includes(DashboardInclude.KPIS)) {
      response.kpis = await this.spaceDashboardSectionsService.getKpis(spaceId, tenantId, from, to);
    }

    if (include.includes(DashboardInclude.CHARTS)) {
      response.charts = await this.spaceDashboardSectionsService.getCharts(
        spaceId,
        tenantId,
        from,
        to,
        query.granularity || DashboardGranularity.DAY,
      );
    }

    if (include.includes(DashboardInclude.LISTS)) {
      response.lists = await this.spaceDashboardSectionsService.getLists(spaceId, tenantId, from, to);
    }

    // Cache the response
    await this.setCache(cacheKey, response);

    const duration = Date.now() - startTime;
    this.logger.log(`Dashboard computed for space ${spaceId} in ${duration}ms`);

    return response;
  }

  private async getDashboardVersion(spaceId: string, tenantId: string) {
    let version = await this.prisma.spaceDashboardVersion.findUnique({
      where: { spaceId },
    });

    if (version && version.tenantId !== tenantId) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    if (!version) {
      version = await this.prisma.spaceDashboardVersion.create({
        data: { spaceId, tenantId, version: 1 },
      });
    }

    return version;
  }

  private buildCacheKey(
    tenantId: string,
    spaceId: string,
    query: DashboardQueryDto,
    version: number,
  ): string {
    const { from, to } = this.getDateRange(query);
    const filtersHash = this.hashFilters(query);
    const granularity = query.granularity || DashboardGranularity.DAY;
    const include = (query.include || []).sort().join(',');

    return `${this.CACHE_PREFIX}:${tenantId}:${spaceId}:${from}:${to}:${granularity}:${include}:${filtersHash}:${version}`;
  }

  private hashFilters(query: DashboardQueryDto): string {
    const filterData = JSON.stringify({
      configId: query.configId,
    });
    return createHash('md5').update(filterData).digest('hex').substring(0, 8);
  }

  private getDateRange(query: DashboardQueryDto): { from: string; to: string } {
    const now = new Date();
    const to = query.to || now.toISOString().split('T')[0];
    const from =
      query.from ||
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return { from, to };
  }

  private buildMeta(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
    query: DashboardQueryDto,
    version: number,
    cacheHit: boolean,
  ): DashboardMetaDto {
    return {
      spaceId,
      tenantId,
      from,
      to,
      granularity: query.granularity || DashboardGranularity.DAY,
      filtersHash: this.hashFilters(query),
      analyticsVersion: version,
      generatedAt: new Date().toISOString(),
      cache: {
        hit: cacheHit,
        ttlSeconds: this.CACHE_TTL,
      },
    };
  }

  private buildSpaceInfo(space: any): SpaceInfoDto {
    return {
      id: space.id,
      name: space.name,
      timezone: space.timezone || 'Europe/Paris',
      configs: space.configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity,
      })),
    };
  }

  private async getFromCache(
    key: string,
  ): Promise<DashboardResponseDto | null> {
    try {
      const cached = await this.redis.get<DashboardResponseDto>(key);
      if (!cached) return null;

      cached.meta.cache.hit = true;
      return cached;
    } catch (error) {
      this.logger.warn(`Cache read error: ${error.message}`);
      return null;
    }
  }

  private async setCache(
    key: string,
    data: DashboardResponseDto,
  ): Promise<void> {
    try {
      await this.redis.set(key, data, { ttl: this.CACHE_TTL });
    } catch (error) {
      this.logger.warn(`Cache write error: ${error.message}`);
    }
  }

  async invalidateCache(spaceId: string, tenantId: string): Promise<number> {
    try {
      const pattern = `${this.CACHE_PREFIX}:${tenantId}:${spaceId}:*`;
      return this.redis.deletePattern(pattern);
    } catch (error) {
      this.logger.error(`Cache invalidation error: ${error.message}`);
      return 0;
    }
  }

  async incrementVersion(spaceId: string, tenantId: string): Promise<void> {
    await this.prisma.spaceDashboardVersion.upsert({
      where: { spaceId },
      create: {
        spaceId,
        tenantId,
        version: 1,
      },
      update: {
        version: { increment: 1 },
      },
    });
  }
}
