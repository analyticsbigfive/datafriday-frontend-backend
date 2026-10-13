import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des endpoints « rendement » (dimensions article, valorisation stock,
 * valorisation par event). Les listes arrivent en CSV (`a,b,c`) ou en paramètre répété.
 */

/** `a,b` ou `['a','b']` vers un tableau de chaînes non vides, sans doublon. */
export function toIdList(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const out = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  return out.length ? out : undefined;
}

const CsvList = () => Transform(({ value }) => toIdList(value));

export class ArticleDimensionsQueryDto {
  /** Optionnel : restreint aux articles vendus dans cet espace (et à leurs enfants de combo). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  spaceId?: string;
}

export class StockValuationQueryDto {
  @IsString()
  @MaxLength(200)
  spaceId: string;

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopIds?: string[];

  /** Noms de PdV (identité côté Analyse), résolus serveur vers les SpaceElement de l'espace. */
  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopNames?: string[];

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopTypes?: string[];

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopAreas?: string[];

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  industrialIds?: string[];

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  supplierIds?: string[];
}

export class EventValuationQueryDto {
  @IsString()
  @MaxLength(200)
  spaceId: string;

  @CsvList() @IsArray() @IsString({ each: true })
  eventIds: string[];

  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopIds?: string[];

  /** Noms de PdV (identité côté Analyse), résolus serveur vers les SpaceElement de l'espace. */
  @IsOptional() @CsvList() @IsArray() @IsString({ each: true })
  shopNames?: string[];
}
