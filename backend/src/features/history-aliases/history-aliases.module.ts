import { Module } from '@nestjs/common';
import { HistoryAliasesController } from './history-aliases.controller';
import { HistoryAliasesService } from './history-aliases.service';

@Module({
  controllers: [HistoryAliasesController],
  providers: [HistoryAliasesService],
  exports: [HistoryAliasesService],
})
export class HistoryAliasesModule {}
