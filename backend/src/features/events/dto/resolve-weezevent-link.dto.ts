import { ApiProperty } from '@nestjs/swagger';
import { IsString, ValidateIf } from 'class-validator';

// BUG-021 : résolution manuelle d'un appariement Event <-> WeezeventEvent ambigu.
export class ResolveWeezeventLinkDto {
  @ApiProperty({ nullable: true, description: 'ID du WeezeventEvent à lier ; null pour délier explicitement' })
  @ValidateIf((o) => o.weezeventEventId !== null)
  @IsString()
  weezeventEventId: string | null;
}
