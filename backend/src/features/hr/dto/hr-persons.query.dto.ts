import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class HrPersonsFindAllQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  roleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contractType?: string;
}
