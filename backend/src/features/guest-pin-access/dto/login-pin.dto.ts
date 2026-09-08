import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class LoginPinDto {
  @ApiProperty({ description: 'Code PIN à 6 chiffres', example: '482913' })
  @Matches(/^\d{6}$/, { message: 'Le PIN doit contenir exactement 6 chiffres' })
  pin: string;
}
