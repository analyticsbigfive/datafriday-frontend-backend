import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSpaceElementDto {
  @ApiPropertyOptional({ description: 'Nom du shop' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'URL ou base64 de l\'image du shop' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Notes libres' })
  @IsOptional()
  @IsString()
  notes?: string;

  // CFG-2 Étape 2 : plus d'enum Postgres figé, donc plus de @IsEnum statique possible ici.
  // Pas de validation d'existence ajoutée à ce stade (Étape 3, pas encore faite, revoit
  // spaces.service.ts::updateSpaceElement et les autres consommateurs de ce champ) — ce champ
  // reste permissif comme les autres champs texte-libre-validés-par-référentiel du backend
  // (`inventoryPackaging`, `storageType`) en attendant.
  @ApiPropertyOptional({ description: 'Type principal de l\'élément (code ou id Department)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ type: [String], description: 'Sous-types shop (Food, Beverages, etc.)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopTypes?: string[];
}
