import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  Min,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Zones non numériques acceptées par `assign-floor` en plus d'un niveau d'étage entier.
 * Partagé entre le DTO (validation) et le service (branchement).
 */
export const ASSIGN_FLOOR_ZONES = ['forecourt', 'externalmerch'] as const;
export type AssignFloorZone = (typeof ASSIGN_FLOOR_ZONES)[number];
export type AssignFloorLevel = number | AssignFloorZone;

/**
 * `level` doit être SOIT un entier (étage / sous-sol, y compris 0 et négatifs),
 * SOIT l'une des zones de `ASSIGN_FLOOR_ZONES`. class-validator n'a pas de
 * décorateur d'union (`@IsUnion` n'existe pas) → validateur custom dédié.
 */
@ValidatorConstraint({ name: 'isFloorLevelOrZone', async: false })
export class IsFloorLevelOrZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value === 'number') return Number.isInteger(value);
    if (typeof value === 'string') return (ASSIGN_FLOOR_ZONES as readonly string[]).includes(value);
    return false;
  }

  defaultMessage(_args: ValidationArguments): string {
    return `level doit être un entier (étage/sous-sol) ou l'une des zones: ${ASSIGN_FLOOR_ZONES.join(', ')}`;
  }
}

/**
 * Position (m) du premier shop assigné sur le plan de la zone — les suivants sont
 * posés en rangée (pas de `width + 1` m). Vient du minimap du dialogue « Assigner
 * un étage » (étape 2 Data Integration).
 */
export class AssignFloorPositionDto {
  @ApiProperty({ description: 'X (m) sur le plan de la zone', example: 31 })
  @IsNumber()
  @Min(0)
  x: number;

  @ApiProperty({ description: 'Y (m) sur le plan de la zone', example: 34 })
  @IsNumber()
  @Min(0)
  y: number;
}

/** Dimensions (m) appliquées aux shops assignés. */
export class AssignShopDimensionsDto {
  @ApiPropertyOptional({ description: 'Largeur (m)', example: 4 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @ApiPropertyOptional({ description: 'Profondeur (m)', example: 4 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  depth?: number;

  @ApiPropertyOptional({ description: 'Hauteur (m)', example: 4 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  height?: number;
}

export class AssignElementsToFloorDto {
  @ApiProperty({
    description: 'IDs des SpaceElements (shops) à assigner',
    type: [String],
    example: ['elem-abc123', 'elem-def456'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  elementIds: string[];

  @ApiProperty({
    description:
      "Niveau d'étage (entier, ex. 0=RDC, 1=Étage 1, -1=Sous-sol 1) OU une zone: 'forecourt' / 'externalmerch'",
    oneOf: [
      { type: 'integer', example: 1 },
      { type: 'string', enum: [...ASSIGN_FLOOR_ZONES] },
    ],
    example: 0,
  })
  @Validate(IsFloorLevelOrZone)
  level: AssignFloorLevel;

  @ApiPropertyOptional({
    description:
      "ID de la configuration cible (celle créée à l'étape 1 ou dans le 3D Builder). " +
      "Les shops sont assignés DANS cette configuration. Si omis, le backend retombe sur la " +
      "configuration utilisateur principale (la plus ancienne, non-système) de l'espace — " +
      "et ne crée JAMAIS de configuration « Weezevent Import » tant qu'une config utilisateur existe.",
    example: 'cfg-abc123',
  })
  @IsOptional()
  @IsString()
  configId?: string;

  @ApiPropertyOptional({
    description: "Largeur (m) à utiliser si un nouveau floor/zone doit être créé pour cette assignation.",
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @ApiPropertyOptional({
    description: "Profondeur/longueur (m) à utiliser si un nouveau floor/zone doit être créé.",
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  @ApiPropertyOptional({
    description: "Hauteur (m) à utiliser si un nouveau floor doit être créé.",
    example: 4,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  height?: number;

  @ApiPropertyOptional({
    description:
      'Nouveau nom de la zone/étage cible. Appliqué à la Zone (v2) ou au Floor + JSON (legacy v1). ' +
      'Remplace l\'aller-retour getConfiguration + updateConfiguration que faisait le front.',
    example: 'Tribune Nord',
  })
  @IsOptional()
  @IsString()
  zoneName?: string;

  @ApiPropertyOptional({ description: 'Position (m) du premier shop sur le plan — les suivants sont posés en rangée.', type: AssignFloorPositionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignFloorPositionDto)
  position?: AssignFloorPositionDto;

  @ApiPropertyOptional({ description: 'Dimensions (m) appliquées aux shops assignés.', type: AssignShopDimensionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignShopDimensionsDto)
  shopDimensions?: AssignShopDimensionsDto;
}
