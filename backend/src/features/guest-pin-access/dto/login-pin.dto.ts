import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { POS_VENDOR_NAME_MAX } from '../../pos/pos.contracts';

export class LoginPinDto {
  @ApiProperty({ description: 'Code PIN à 6 chiffres', example: '482913' })
  @Matches(/^\d{6}$/, { message: 'Le PIN doit contenir exactement 6 chiffres' })
  pin: string;

  @ApiPropertyOptional({
    description: 'Phase pos uniquement : nom du vendeur (obligatoire pour ouvrir une caisse, ignoré par les autres phases)',
    example: 'Awa',
  })
  @IsOptional()
  @IsString()
  // Marge sur la limite : le nom est nettoyé (espaces) puis tronqué côté service.
  @MaxLength(POS_VENDOR_NAME_MAX * 2)
  vendorName?: string;
}
