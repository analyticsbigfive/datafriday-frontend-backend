import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { STOCK_ITEM_KINDS, StockItemKind } from '../../logistics/dto/logistics.dto';

export const LOGISTIC_TASK_PRIORITIES = ['VERY_URGENT', 'URGENT', 'TODO', 'NOT_PRIORITY'] as const;
export type LogisticTaskPriorityValue = (typeof LOGISTIC_TASK_PRIORITIES)[number];

export class CreateLogisticTaskLineDto {
  @ApiProperty({ description: "Clé de la denrée (référentiel Logistic, même convention que StockMovement.itemKey)" })
  @IsString()
  @IsNotEmpty()
  itemKey: string;

  @ApiPropertyOptional({
    enum: STOCK_ITEM_KINDS,
    description: 'ADR-0006 (chantier 377) — voir CreateMovementDto.itemKind. Optionnel, préféré à la résolution serveur par nom quand fourni avec itemRefId.',
  })
  @IsOptional()
  @IsIn(STOCK_ITEM_KINDS as unknown as string[])
  itemKind?: StockItemKind;

  @ApiPropertyOptional({ description: 'ADR-0006 (chantier 377) — voir CreateMovementDto.itemRefId.' })
  @IsOptional()
  @IsString()
  itemRefId?: string;

  @ApiPropertyOptional({ description: "Menu item si l'item du référentiel est un produit readyForSale" })
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @ApiProperty({ description: 'PDV/Storage origine (où le stock est prélevé)' })
  @IsString()
  @IsNotEmpty()
  sourceElementId: string;

  @ApiProperty({ description: 'PDV/Storage destination (où le stock est déposé)' })
  @IsString()
  @IsNotEmpty()
  destinationElementId: string;

  @ApiProperty({ description: 'Nombre de packs (entier ≥ 0)' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packed: number;

  @ApiProperty({ description: "Nombre d'unités en vrac (décimal ≥ 0)" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  loose: number;

  @ApiProperty({ description: 'Utilisateur assigné (logisticien)' })
  @IsString()
  @IsNotEmpty()
  assignedToUserId: string;

  @ApiProperty({ enum: LOGISTIC_TASK_PRIORITIES })
  @IsIn(LOGISTIC_TASK_PRIORITIES as unknown as string[])
  priority: LogisticTaskPriorityValue;
}

export class CreateLogisticTaskBatchDto {
  @ApiProperty({ type: [CreateLogisticTaskLineDto], description: 'Une ligne par tâche du drawer "Restocker"' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLogisticTaskLineDto)
  tasks: CreateLogisticTaskLineDto[];
}
