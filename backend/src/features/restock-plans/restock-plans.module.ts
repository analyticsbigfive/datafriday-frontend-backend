import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import {
  RestockPlansController,
  RestockPlansStandaloneController,
} from './restock-plans.controller';
import { RestockPlansService } from './restock-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [RestockPlansController, RestockPlansStandaloneController],
  providers: [RestockPlansService],
})
export class RestockPlansModule {}
