import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

/** PUT pos/:spaceId/events/:eventId/settings (PosEventSettingDto) */
export class PosEventSettingsBodyDto {
  @IsArray()
  @IsString({ each: true })
  paymentMethodIds: string[];

  @IsBoolean()
  promosEnabled: boolean;

  @IsBoolean()
  cancelEnabled: boolean;

  /** Optionnel (ajout additif) : absent = valeur actuelle conservée. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  lowStockUnits?: number;

  /** Optionnel (ajout additif) : absent = valeur actuelle conservée (défaut false à la création). */
  @IsOptional()
  @IsBoolean()
  tipsEnabled?: boolean;
}

/** PUT pos/:spaceId/events/:eventId/pdv/:elementId (PosPdvSettingUpdate) */
export class PosPdvSettingBodyDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  responsibleHrPersonId: string | null;
}

/** Query de GET .../sales et .../sales/export (PosSalesQuery) */
export class PosSalesQueryDto {
  @IsOptional() @IsString() elementId?: string;
  @IsOptional() @IsString() paymentMethodId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
