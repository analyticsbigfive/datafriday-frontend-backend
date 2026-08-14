import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  IsEnum,
  IsIn,
  Min,
  Max,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { KitchenType } from '@prisma/client';

/**
 * Valide le blob spacePrices : { [spaceId]: { ttc, vatRate 0-100 } }
 * ou forme legacy { [spaceId]: number }. Historiquement non validé,
 * alors qu'il alimente directement SpaceMenuItem.priceTtc/vatRate.
 * Les prix négatifs (remises/avoirs) sont autorisés — seule la finitude est exigée.
 */
function IsSpacePricesRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSpacePricesRecord',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value == null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          return Object.values(value as Record<string, unknown>).every((v) => {
            if (typeof v === 'number') return Number.isFinite(v);
            if (v && typeof v === 'object') {
              const { ttc, vatRate } = v as { ttc?: unknown; vatRate?: unknown };
              const ttcOk = typeof ttc === 'number' && Number.isFinite(ttc);
              const vatOk =
                vatRate == null ||
                (typeof vatRate === 'number' && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100);
              return ttcOk && vatOk;
            }
            return false;
          });
        },
        defaultMessage: () =>
          'spacePrices doit être { [spaceId]: { ttc: number, vatRate?: 0-100 } } ou { [spaceId]: number }',
      },
    });
  };
}

export class MenuItemComponentLineDto {
  @ApiProperty({ description: 'ID du composant (MenuComponent)' })
  @IsString()
  componentId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  numberOfUnits: number;
}

export class MenuItemIngredientLineDto {
  @ApiProperty({ description: "ID de l'ingrédient" })
  @IsString()
  ingredientId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  numberOfUnits: number;
}

export class MenuItemPackagingLineDto {
  @ApiProperty({ description: 'ID du packaging' })
  @IsString()
  packagingId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  numberOfUnits: number;
}

export class MenuItemComboLineDto {
  @ApiProperty({ description: "ID de l'article vendable composant ce combo (MenuItem)" })
  @IsString()
  childId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unité (optionnelle)' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Coût total de la ligne (optionnel, recalculé automatiquement si non fourni)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;
}

export class ReplaceMenuItemComboItemsDto {
  @ApiProperty({ description: 'Liste complète des articles composant ce combo', type: [MenuItemComboLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComboLineDto)
  comboItems: MenuItemComboLineDto[];
}

export class ReplaceMenuItemComponentsDto {
  @ApiProperty({ description: 'Liste complète des composants', type: [MenuItemComponentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComponentLineDto)
  components: MenuItemComponentLineDto[];
}

export class ReplaceMenuItemIngredientsDto {
  @ApiProperty({ description: 'Liste complète des ingrédients', type: [MenuItemIngredientLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemIngredientLineDto)
  ingredients: MenuItemIngredientLineDto[];
}

export class ReplaceMenuItemPackagingsDto {
  @ApiProperty({ description: 'Liste complète des packagings', type: [MenuItemPackagingLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPackagingLineDto)
  packagings: MenuItemPackagingLineDto[];
}

export class CreateMenuItemDto {
  @ApiProperty({ description: 'Nom de l\'article' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'ID du ProductType' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  typeId?: string;

  @ApiPropertyOptional({ description: 'ID du ProductCategory' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'ID de la Brand' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  brandId?: string;

  @ApiPropertyOptional({ description: 'ID du DisplayName (pour le reporting)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  displayNameId?: string;

  @ApiPropertyOptional({ description: 'ID de la Saison (Custom Date de Configuration)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  seasonId?: string;

  // Prix négatif autorisé (remises/avoirs) — pas de @Min(0).
  @ApiProperty({ description: 'Prix de vente de base (TTC brut, négatif autorisé)' })
  @IsNumber()
  @Type(() => Number)
  basePrice: number;

  @ApiPropertyOptional({ description: 'Taux de TVA % par article (null → défaut tenant)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  vatRate?: number;

  @ApiPropertyOptional({ description: 'Type de remise catalogue', enum: ['percent', 'amount'] })
  @IsOptional()
  @IsIn(['percent', 'amount'])
  discountType?: 'percent' | 'amount';

  @ApiPropertyOptional({ description: 'Valeur de remise (% si percent, montant TTC si amount)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountValue?: number;

  @ApiPropertyOptional({ description: 'Coût total calculé' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalCost?: number;

  @ApiPropertyOptional({ description: 'Marge en pourcentage' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  margin?: number;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'URL ou base64 de l\'image' })
  @IsOptional()
  @IsString()
  picture?: string;

  @ApiPropertyOptional({ description: 'Allergènes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({ description: 'Régimes alimentaires', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diet?: string[];

  @ApiPropertyOptional({ description: 'Types de stockage', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storageType?: string[];

  @ApiPropertyOptional({ description: 'Prêt à la vente: Yes, No' })
  @IsOptional()
  @IsString()
  readyForSale?: string;

  @ApiPropertyOptional({ description: 'Cuisine de préparation (saisi quand readyForSale = "Yes")', enum: KitchenType })
  @IsOptional()
  @IsEnum(KitchenType)
  kitchenType?: KitchenType;

  @ApiPropertyOptional({ description: 'Article combo: Yes, No' })
  @IsOptional()
  @IsString()
  comboItem?: string;

  @ApiPropertyOptional({ description: 'Nombre de pièces par recette (diviseur du coût — minimum 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  numberOfPiecesRecipe?: number;

  @ApiPropertyOptional({ description: 'Données composants JSON' })
  @IsOptional()
  componentsData?: any;

  @ApiPropertyOptional({ description: 'Type de conditionnement inventaire (ex: Box, Bag, Pallet)' })
  @IsOptional()
  @IsString()
  inventoryPackagingType?: string;

  @ApiPropertyOptional({ description: "Nombre d'unités par conditionnement inventaire" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  inventoryNumberOfUnits?: number;

  @ApiPropertyOptional({ description: 'Unité du conditionnement inventaire (ex: Kg, L, Pc)' })
  @IsOptional()
  @IsString()
  inventoryUnit?: string;

  @ApiPropertyOptional({ description: 'IDs des espaces associés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];

  @ApiPropertyOptional({
    description:
      "Si true, réutilise un MenuItem actif du même nom (tenant, casse/espaces ignorés) au lieu d'en créer un doublon — utilisé par le quick-create de la Data Integration (BUG-052). Ignoré par défaut pour ne pas changer le comportement du builder manuel.",
  })
  @IsOptional()
  dedupeByName?: boolean;

  @ApiPropertyOptional({
    description:
      'Prix de vente par espace. Forme courante : { [spaceId]: { ttc, vatRate } } (TVA propre à l’espace). Forme legacy tolérée : { [spaceId]: number } (TTC seul).',
  })
  @IsOptional()
  @IsSpacePricesRecord()
  spacePrices?: Record<string, { ttc: number; vatRate?: number | null } | number>;

  @ApiPropertyOptional({ description: 'Composants (source de vérité)', type: [MenuItemComponentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComponentLineDto)
  components?: MenuItemComponentLineDto[];

  @ApiPropertyOptional({ description: 'Ingrédients (source de vérité)', type: [MenuItemIngredientLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemIngredientLineDto)
  ingredients?: MenuItemIngredientLineDto[];

  @ApiPropertyOptional({ description: 'Packagings (source de vérité)', type: [MenuItemPackagingLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPackagingLineDto)
  packagings?: MenuItemPackagingLineDto[];

  @ApiPropertyOptional({ description: 'Composition combo (autres MenuItem vendables, source de vérité)', type: [MenuItemComboLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComboLineDto)
  comboItems?: MenuItemComboLineDto[];
}

export class BulkCreateMenuItemsDto {
  @ApiProperty({ description: 'Articles de menu à créer', type: [CreateMenuItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemDto)
  items: CreateMenuItemDto[];
}
