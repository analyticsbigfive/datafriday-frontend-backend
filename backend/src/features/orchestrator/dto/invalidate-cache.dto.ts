import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InvalidateCacheDto {
  // Le tenantId n'est plus lu depuis le body : BUG-40, il est dérivé du tenant
  // authentifié via @CurrentTenant() côté controller pour éviter qu'un client
  // ne cible le cache d'un autre tenant.

  @ApiPropertyOptional({ description: 'ID de l’espace ciblé', example: 'space-123' })
  @IsOptional()
  @IsString()
  spaceId?: string;
}
