import { Module } from '@nestjs/common';
import { PackingTypesController } from './packing-types.controller';
import { PackingTypesService } from './packing-types.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PackingTypesController],
  providers: [PackingTypesService],
  exports: [PackingTypesService],
})
export class PackingTypesModule {}
