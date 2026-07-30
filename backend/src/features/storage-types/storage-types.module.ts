import { Module } from '@nestjs/common';
import { StorageTypesController } from './storage-types.controller';
import { StorageTypesService } from './storage-types.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StorageTypesController],
  providers: [StorageTypesService],
  exports: [StorageTypesService],
})
export class StorageTypesModule {}
