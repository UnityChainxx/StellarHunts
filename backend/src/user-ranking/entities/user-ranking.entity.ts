import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Check,
} from 'typeorm';

@Entity()
@Check('"score" >= 0')
@Check('"achievements" >= 0')
@Check('"activityPoints" >= 0')
export class UserRank {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 128 })
  @Index({ unique: true })
  userId: string;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  achievements: number;

  @Column({ default: 0 })
  activityPoints: number;

  @Column({ default: 0 })
  rank: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUpdated: Date;
}
