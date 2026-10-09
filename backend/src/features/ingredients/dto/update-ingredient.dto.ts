import { PartialType } from '@nestjs/swagger';
import { CreateIngredientDto } from './create-ingredient.dto';

/** Mise à jour partielle : mêmes règles de validation que la création, tous champs optionnels. */
export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {}
