import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreatePredictVersionDto {
  @ApiProperty({ description: 'Nom de la version de prédiction' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'ID de l\'espace associé' })
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Version par défaut ?', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ description: 'Snapshot de l\'événement au moment de la sauvegarde', type: 'object' })
  @IsObject()
  eventSnapshot: Record<string, any>;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedTotalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  perCapita?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedPerCapita?: number;

  @ApiPropertyOptional({ description: 'Configuration du menu (menuConfig)', type: 'object' })
  @IsOptional()
  @IsObject()
  menuConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Ajustements de quantité', type: 'object' })
  @IsOptional()
  @IsObject()
  quantityAdjustments?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Quantités absolues (items à prédiction 0)', type: 'object' })
  @IsOptional()
  @IsObject()
  manualQuantities?: Record<string, number>;

  // @Type(() => Object) requis — même piège que CreateEventDto.sessions : sans lui,
  // enableImplicitConversion lit le design:type `Array` et réduit chaque élément-objet à []
  // via Array.from(). Cf. commentaire détaillé dans create-event.dto.ts.
  @ApiPropertyOptional({ description: 'Quantités prédites par item (shop × menuItem) pour le réarmement', type: 'array' })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  predictedRecords?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: 'IDs des événements de prédiction sélectionnés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPredictionEventIds?: string[];

  @ApiPropertyOptional({ description: 'Plage horaire sélectionnée { start, end } ou null pour effacer' })
  @IsOptional()
  @ValidateIf((o) => o.selectedTimeRange !== null)
  @IsObject()
  selectedTimeRange?: { start: string | null; end: string | null } | null;
}

// isDefault exclu volontairement : le passage en défaut passe uniquement par
// PUT .../predict-versions/default (SetDefaultVersionDto), jamais par ce patch générique.
export class PatchPredictVersionDto extends PartialType(
  OmitType(CreatePredictVersionDto, ['isDefault'] as const),
) {}

export class SetDefaultVersionDto {
  @ApiPropertyOptional({ description: 'ID de la version à passer en default, null pour retirer le défaut', nullable: true })
  @IsOptional()
  @IsString()
  versionId?: string | null;
}
