import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMarketPriceDto {
  @ApiProperty({ required: false, description: "ID existant — fourni uniquement par l'import en masse pour upsert (cf. bulkCreate), ignoré par create()" })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'Nom du produit' })
  @IsString()
  itemName: string;

  @ApiProperty({ description: 'Unité (kg, l, unit, etc.)' })
  @IsString()
  unit: string;

  @ApiProperty({ description: 'Prix', type: Number })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiProperty({ description: 'Type de produit (référentiel dynamique MarketPriceType)' })
  @IsString()
  goodType: string;

  @ApiProperty({ required: false, description: 'Catégorie produit (texte libre, legacy)' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false, description: 'ID du Market Price Type (MarketPriceType)' })
  @IsString()
  @IsOptional()
  marketPriceTypeId?: string;

  @ApiProperty({ required: false, description: 'ID de la Market Price Category (MarketPriceCategory)' })
  @IsString()
  @IsOptional()
  marketPriceCategoryId?: string;

  @ApiProperty({ required: false, description: "ID de l'Industrial (fabricant/façonnier de cette ligne d'achat)" })
  @IsString()
  @IsOptional()
  industrialId?: string;

  @ApiProperty({ required: false, description: 'Image URL' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ required: false, description: 'Nom fournisseur' })
  @IsString()
  @IsOptional()
  supplier?: string;

  @ApiProperty({ required: false, description: 'ID fournisseur' })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ required: false, description: 'Nom article chez le fournisseur' })
  @IsString()
  @IsOptional()
  supplierItem?: string;

  @ApiProperty({ required: false, description: 'Unité recette' })
  @IsString()
  @IsOptional()
  recipeUnit?: string;

  @ApiProperty({ required: false, description: 'Conversion unité achat → recette' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  purchaseUnitConversion?: number;

  @ApiProperty({ required: false, description: 'Prix par unité' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  pricePerUnit?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  packedUnits?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  numberOfUnits?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  unitsPerPurchase?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  packingWidth?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  packingHeight?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  packingLength?: number;

  @ApiProperty({ required: false, description: "Emballage d'achat — \"Item is purchased in\" (ex: Box, Bag, Pallet)" })
  @IsString()
  @IsOptional()
  purchasePackaging?: string;

  @ApiProperty({ required: false, description: 'Emballage de stockage — "Item is stored in" (ex: Box, Bag, Pallet)' })
  @IsString()
  @IsOptional()
  inventoryPackaging?: string;
}
