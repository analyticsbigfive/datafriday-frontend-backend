import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsArray, IsNotEmpty } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Nom du fournisseur' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Email de contact' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Téléphone' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Adresse' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'Ville' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ description: 'Code postal' })
  @IsString()
  @IsNotEmpty()
  postcode: string;

  @ApiProperty({ description: 'Image URL', required: false })
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiProperty({ description: 'Contact name' })
  @IsString()
  @IsNotEmpty()
  contactName: string;

  @ApiProperty({ description: 'Space IDs (sites)', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  spaceIds?: string[];

  @ApiProperty({ description: 'Configuration IDs per space', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  configurationIds?: string[];

  @ApiProperty({ description: 'Sectors', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  sectors?: string[];

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
