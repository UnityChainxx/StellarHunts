import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { PromoCode } from '../promo-code.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('promo_code_redemptions')
@Unique(['promoCode', 'user']) // ensures one-time redemption per user
export class PromoCodeRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PromoCode, { eager: true })
  promoCode: PromoCode;

  @ManyToOne(() => User)
  user: User;

  @CreateDateColumn()
  redeemedAt: Date;
}
