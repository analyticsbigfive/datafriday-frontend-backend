import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/** Fiche cuisine (Settings > Menu F&B > Cuisines) : nom et espaces obligatoires. */
export class CreateKitchenDto {
  @ApiProperty({ description: 'Nom de la cuisine' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Image (data URI ou URL)', required: false })
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiProperty({ description: 'Nom du responsable', required: false })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiProperty({ description: 'Email du responsable', required: false })
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Téléphone du responsable', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Adresse de livraison', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ description: 'Ville', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ description: 'Code postal', required: false })
  @IsString()
  @IsOptional()
  postcode?: string;

  @ApiProperty({ description: 'Espaces rattachés', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  spaceIds: string[];

  @ApiProperty({ description: 'Note', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
