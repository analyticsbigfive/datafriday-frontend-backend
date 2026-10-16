import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsISO8601, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { POS_MAX_LINES, POS_MAX_QUANTITY } from '../sales/pos-sale-rules';

export class PosSaleLineDto {
  @ApiProperty({ description: 'MenuItem.id' })
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ description: 'Quantité entière, 1 au minimum (une déconsigne = article de déconsigne)' })
  @IsInt()
  @Min(1)
  @Max(POS_MAX_QUANTITY)
  quantity: number;
}

export class PosSalePaymentDto {
  @ApiProperty({ description: 'PaymentMethod.id (référentiel Configuration > Moyens de paiement)' })
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @ApiProperty({ description: 'Montant TTC encaissé, négatif pour un remboursement de déconsigne' })
  @IsNumber({ maxDecimalPlaces: 2 })
  amountTtc: number;

  @ApiPropertyOptional({ description: 'Pourboire TTC de ce paiement (>= 0), hors CA et hors TVA ; refusé si les pourboires sont désactivés' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipTtc?: number;
}

export class PosCreateSaleDto {
  @ApiProperty({ description: 'UUID v4 généré par la tablette : la clé d\'idempotence du ticket' })
  @IsUUID('4')
  clientTicketId: string;

  @ApiProperty({ type: [PosSalePaymentDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PosSalePaymentDto)
  payments: PosSalePaymentDto[];

  @ApiPropertyOptional({ description: 'Horodatage tablette (ISO 8601), informatif' })
  @IsOptional()
  @IsISO8601()
  clientCreatedAt?: string;

  @ApiProperty({ type: [PosSaleLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(POS_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines: PosSaleLineDto[];
}

/** Filtres de l'historique invité. Le PdV et l'évènement viennent du jeton, jamais de la requête. */
export class PosGuestSalesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Numéro de ticket ou nom du vendeur' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: '50 par défaut, 200 au plus' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
