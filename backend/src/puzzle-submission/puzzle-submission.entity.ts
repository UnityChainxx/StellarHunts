import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['playerId', 'puzzleId'])
// One attempt number per player+puzzle: concurrent duplicate submissions
// collide here instead of silently creating duplicate rows (issue #364).
@Index(['playerId', 'puzzleId', 'attemptCount'], { unique: true })
export class PuzzleSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  playerId: string;

  @Column()
  puzzleId: string;

  @Column()
  answer: string;

  @Column({ default: false })
  isCorrect: boolean;

  @Column({ default: 1 })
  attemptCount: number;

  @CreateDateColumn()
  timestamp: Date;
}
