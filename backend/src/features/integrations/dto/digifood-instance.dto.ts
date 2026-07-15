import { IsString, IsBoolean, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateDigifoodInstanceDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    // Secret HMAC remis par Digifood au provisioning du webhook (chiffré au repos)
    @IsString()
    @MinLength(1)
    webhookSecret!: string;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}

export class UpdateDigifoodInstanceDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string;

    // Optionnel en update : rotation du secret uniquement si fourni
    @IsOptional()
    @IsString()
    @MinLength(1)
    webhookSecret?: string;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}
