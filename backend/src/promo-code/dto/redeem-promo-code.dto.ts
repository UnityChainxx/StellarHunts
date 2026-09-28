import { IsString } from 'class-validator';

export class RedeemPromoCodeDto {
  @IsString()
  code: string;
}
