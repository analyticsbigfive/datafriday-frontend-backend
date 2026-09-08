import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Version réduite de CreateInventoryCountDto pour la surface invité : pas de
 * spaceId/eventId/shopId — ces trois valeurs viennent exclusivement de
 * request.user (payload du JWT invité), jamais du body client.
 */
export class SaveGuestCountDto {
  @ApiProperty({ description: "ID de l'article (MenuItem ou itemId interne)" })
  @IsString()
  itemId: string;

  @ApiProperty({ description: 'Unités en carton (emballé)', type: Number })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packedUnits: number;

  @ApiProperty({ description: "Unités à l'unité (en vrac, peut être décimal)", type: Number })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  looseUnits: number;

  @ApiProperty({ description: 'Article coché comme compté', type: Boolean })
  @IsBoolean()
  isCounted: boolean;

  @ApiPropertyOptional({ description: 'Emplacement de stockage' })
  @IsOptional()
  @IsString()
  storageLocation?: string | null;

  @ApiPropertyOptional({ description: 'Statut du comptage : pending | counted | skipped' })
  @IsOptional()
  @IsString()
  countingStatus?: string;
}
