import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/** Query de GET /cost-tracking/:spaceId/series. Dates au format `YYYY-MM-DD` (jour du fuseau de l'espace). */
export class CostTrackingSeriesQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;

  @IsOptional() @IsString() @MaxLength(200) typeId?: string;
  @IsOptional() @IsString() @MaxLength(200) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) menuItemId?: string;

  /** Absent : déduit des filtres (voir CostTrackingSeriesService.resolveGroupBy). */
  @IsOptional() @IsIn(['article', 'category', 'type']) groupBy?: 'article' | 'category' | 'type';
}

/** Query de GET /cost-tracking/:spaceId/articles/:id/history. */
export class CostTrackingHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt() @Min(1) @Max(500)
  limit?: number;
}
