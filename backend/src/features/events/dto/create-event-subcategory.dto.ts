import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEventSubcategoryDto {
  @ApiProperty({ description: "Nom de la sous-catégorie d'événement", example: 'Rock', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // Optionnel ici par construction : le service exige qu'au moins un des deux alias
  // (eventCategoryId ou categoryId) soit fourni, et lève lui-même l'erreur si aucun ne l'est.
  @ApiPropertyOptional({ description: "ID de la catégorie d'événement parente", example: 'cat-123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  eventCategoryId?: string;

  @ApiPropertyOptional({ description: "Alias front de eventCategoryId", example: 'cat-123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;
}
