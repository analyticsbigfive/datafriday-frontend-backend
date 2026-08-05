// DTOs Builder v2 — contrat docs/REFONTE_3D_BUILDER_V2.md §3.
// ⚠️ ValidationPipe global : whitelist + forbidNonWhitelisted → TOUT champ accepté
// doit être décoré, sinon 400 (cf. mémoire projet « strip-retry front = 400 only »).
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsBoolean, IsArray,
  IsObject, IsEnum, IsIn, ValidateNested, ArrayNotEmpty, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ZoneKindDto {
  FLOOR = 'FLOOR',
  FORECOURT = 'FORECOURT',
  EXTERNAL = 'EXTERNAL',
}

// ─── Zones ────────────────────────────────────────────────────────────────────

export class CreateZoneDto {
  @IsEnum(ZoneKindDto)
  kind: ZoneKindDto;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsNumber()
  width: number;

  @IsNumber()
  length: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsObject()
  geometry?: Record<string, any>;

  @IsOptional()
  @IsInt()
  sortIndex?: number;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  length?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsObject()
  geometry?: Record<string, any>;

  @IsOptional()
  @IsInt()
  sortIndex?: number;
}

export class ReorderZonesDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds: string[];
}

// ─── Éléments ─────────────────────────────────────────────────────────────────

class CornerRadiusDto {
  @IsOptional() @IsNumber() topLeft?: number;
  @IsOptional() @IsNumber() topRight?: number;
  @IsOptional() @IsNumber() bottomLeft?: number;
  @IsOptional() @IsNumber() bottomRight?: number;
}

export class CreateElementDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subtypes?: string[];

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  width: number;

  @IsNumber()
  depth: number;

  @IsOptional()
  @IsNumber()
  height3d?: number;

  @IsOptional()
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsInt()
  capacity?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CornerRadiusDto)
  cornerRadius?: CornerRadiusDto;

  // Adhésions initiales — l'élément naît membre de la config active (doc §2.3).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  configIds?: string[];
}

export class UpdateElementDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) subtypes?: string[];
  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() depth?: number;
  @IsOptional() @IsNumber() height3d?: number;
  @IsOptional() @IsNumber() rotation?: number;
  @IsOptional() @IsInt() capacity?: number | null;
  @IsOptional() @IsString() image?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() area?: string | null;
  @IsOptional() @IsObject() attributes?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CornerRadiusDto)
  cornerRadius?: CornerRadiusDto;
}

export class BatchElementItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() depth?: number;
  @IsOptional() @IsNumber() rotation?: number;
}

export class BatchElementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BatchElementItemDto)
  items: BatchElementItemDto[];
}

export class DuplicateElementDto {
  @IsOptional() @IsNumber() offsetX?: number;
  @IsOptional() @IsNumber() offsetY?: number;
}

// ─── Sous-ressources d'élément ────────────────────────────────────────────────

export class PutPerformanceDto {
  @IsOptional() @IsNumber() @Min(0) revenue?: number;
  // Colonne Prisma Int : @IsInt (un 2.5 passait la validation puis 500 côté Postgres)
  @IsOptional() @IsInt() @Min(0) numberOfPOS?: number;
  @IsOptional() @IsNumber() @Min(0) numberOfTransactions?: number;
  @IsOptional() @IsNumber() @Min(0) transactionsPerMinute?: number;
  @IsOptional() @IsNumber() @Min(0) staffCost?: number;
  @IsOptional() @IsNumber() @Min(0) revenuePerEmployee?: number;
}

export class StaffRowDto {
  @IsString()
  @IsNotEmpty()
  position: string;

  @IsInt()
  @Min(0)
  count: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  // Auto-remplissage Sinking RH (2026-07-30) : traçabilité du HrRole d'origine +
  // provenance de la ligne ('AUTO' posée par une règle, 'MANUAL' tapée par l'utilisateur).
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  source?: string;
}

export class PutStaffDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffRowDto)
  staff: StaffRowDto[];
}

// Saisie manuelle "vendu/prévu" par Menu Item, par élément (shop), par config (événement) —
// 11_RH_STAFFING.md §11.16. Scopée par configId (jamais SpaceElement.attributes, cf. §11.14).
export class MenuItemSalesInputRowDto {
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueHt?: number;
}

export class PutMenuItemSalesInputDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemSalesInputRowDto)
  rows: MenuItemSalesInputRowDto[];
}

export class InventoryRowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @IsOptional() @IsBoolean() isCustom?: boolean;
  @IsOptional() @IsString() menuItemId?: string;
}

export class PutInventoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryRowDto)
  inventory: InventoryRowDto[];
}

// ─── Configurations ───────────────────────────────────────────────────────────

export class CreateConfigurationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  cloneFromConfigId?: string;
}

export class RenameConfigurationDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class DeleteConfigurationQueryDto {
  @IsOptional()
  @IsIn(['reassign', 'delete'])
  orphanPolicy?: 'reassign' | 'delete';

  @IsOptional()
  @IsString()
  reassignToConfigId?: string;
}

export class DeleteElementQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  force?: string;
}

export class DeleteZoneQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  force?: string;
}
