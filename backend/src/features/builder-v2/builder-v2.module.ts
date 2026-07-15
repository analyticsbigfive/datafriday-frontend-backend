import { Module } from '@nestjs/common';
import { BuilderV2Controller } from './builder-v2.controller';
import { BuilderV2Service } from './builder-v2.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
// SpacesModule exporte SpacesService : builder-v2 réutilise son invalidation Redis
// (space_shops / space_configs / detail) pour que Space Menu et Data Integration
// voient immédiatement les mutations du builder.
import { SpacesModule } from '../spaces/spaces.module';

@Module({
  imports: [PrismaModule, RedisModule, SpacesModule],
  controllers: [BuilderV2Controller],
  providers: [BuilderV2Service],
  exports: [BuilderV2Service],
})
export class BuilderV2Module {}
