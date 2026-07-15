import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Un item du bulk « créer & mapper » de l'étape 2 Data Integration.
 *
 * Deux formes :
 *  - `elementId` fourni → la location est mappée sur cet élément EXISTANT, rien n'est créé
 *    (le matching par nom est fait côté front, sur la même liste que le dropdown).
 *  - `elementId` absent → un SpaceElement est créé (mêmes règles que POST :id/quick-element :
 *    zone RDC niveau 0, 2×2×2 m, grille) puis mappé.
 */
export class BulkQuickElementItemDto {
  @ApiProperty({ description: 'ID de la location Weezevent à mapper' })
  @IsString()
  @IsNotEmpty()
  weezeventLocationId: string;

  @ApiProperty({ description: 'Nom du shop (utilisé si création)', example: 'Bar Nord' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: "Type d'élément si création (cf. QuickCreateElementDto). Ex: 'shop', 'fnb-beverages'.",
    example: 'shop',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'ID d\'un SpaceElement existant : mappe sans rien créer.',
  })
  @IsString()
  @IsOptional()
  elementId?: string;
}

export class BulkQuickElementsDto {
  @ApiPropertyOptional({
    description: 'Configuration cible pour les créations (sinon config utilisateur principale, cf. resolveTargetConfig).',
  })
  @IsString()
  @IsOptional()
  configId?: string;

  @ApiProperty({ description: 'Locations à créer/mapper', type: [BulkQuickElementItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkQuickElementItemDto)
  items: BulkQuickElementItemDto[];
}
