import { Module } from '@nestjs/common';
import { DepartmentsController, SubtypesController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentsController, SubtypesController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
