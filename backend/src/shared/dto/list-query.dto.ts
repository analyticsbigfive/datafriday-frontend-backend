import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/** `page` / `limit` en chaînes numériques (les services les convertissent et les bornent). */
export class PageLimitQueryDto {
  @IsOptional()
  @Matches(/^\d*$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d*$/)
  limit?: string;
}

/** Liste paginée avec recherche texte. */
export class PageLimitSearchQueryDto extends PageLimitQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  search?: string;
}

/** Pagination Weezevent : `page` / `perPage` entiers. */
export class PagePerPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  perPage?: number;
}
