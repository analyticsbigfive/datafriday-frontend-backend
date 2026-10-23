import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/** Query de GET /cost-tracking/:spaceId/series. Dates au format `YYYY-MM-DD` (jour du fuseau de l'espace). */
export class CostTrackingSeriesQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;

  @IsOptional() @IsString() @MaxLength(200) typeId?: string;
  @IsOptional() @IsString() @MaxLength(200) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) menuItemId?: string;
  /** Mode ingrédient : ne garde que cette ligne de recette (identifiant de l'ingrédient, du composant, de l'emballage ou du fils de combo). */
  @IsOptional() @IsString() @MaxLength(200) ingredientId?: string;

  /** Filtre Fournisseur : id du fournisseur, ou `name:<nom normalisé>` quand la brique n'a pas d'id. Voir GET options. */
  @IsOptional() @IsString() @MaxLength(200) supplierKey?: string;
  /** Filtre Composant : id du composant ; ne garde que les articles dont la recette le contient. */
  @IsOptional() @IsString() @MaxLength(200) componentId?: string;

  /** Absent : déduit des filtres (voir CostTrackingSeriesService.resolveGroupBy). */
  @IsOptional() @IsIn(['article', 'category', 'type', 'ingredient', 'supplier', 'component'])
  groupBy?: 'article' | 'category' | 'type' | 'ingredient' | 'supplier' | 'component';

  /** Type et Catégorie : moyenne des articles (défaut) ou total des coûts par pièce. */
  @IsOptional() @IsIn(['avg', 'sum']) aggregate?: 'avg' | 'sum';
}

/** Query de GET /cost-tracking/:spaceId/options : filtres Type, Catégorie, Article qui bornent les menus Fournisseur et Composant. */
export class CostTrackingOptionsQueryDto {
  @IsOptional() @IsString() @MaxLength(200) typeId?: string;
  @IsOptional() @IsString() @MaxLength(200) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) menuItemId?: string;
}

/** Query de GET /cost-tracking/:spaceId/articles/:id/history. */
export class CostTrackingHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt() @Min(1) @Max(500)
  limit?: number;
}
