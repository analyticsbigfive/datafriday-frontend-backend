import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';

// RedisModule/SpaceAccessModule sont @Global() — rien d'autre à importer ici.
@Module({
  controllers: [LiveController],
})
export class LiveModule {}
