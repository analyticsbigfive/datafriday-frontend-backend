import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StartSimulationRunDto {
  @ApiProperty({ description: 'Intervalle entre deux ventes simulées (ms)', minimum: 5000, maximum: 300000 })
  @IsInt()
  @Min(5000)
  @Max(300000)
  @Type(() => Number)
  intervalMs: number;

  @ApiPropertyOptional({
    description:
      "Mode réel : ignore le refus checkConsumptionFeasibility, comme le pipeline webhook réel. Défaut true pour l'auto-run (un tirage aléatoire resterait bloqué en boucle dès le 1er article à la config de stock incomplète, cf. LiveSaleSimulatorWidget.vue).",
  })
  @IsOptional()
  @IsBoolean()
  realMode?: boolean;

  @ApiPropertyOptional({ description: "Config ciblée pour la résolution des PDV simulables — défaut : config courante de l'espace." })
  @IsOptional()
  @IsString()
  configId?: string;
}

export class PurgeSimulatedSalesDto {
  @ApiProperty({ type: [String], description: 'IDs des SalesTransaction simulées à purger' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  transactionIds: string[];
}
