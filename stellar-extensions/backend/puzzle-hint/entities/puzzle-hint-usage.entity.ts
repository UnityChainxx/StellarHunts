import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('puzzle_hint_usages')
@Unique(['puzzleId', 'userId', 'hintOrder'])
export class PuzzleHintUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  puzzleId: string;

  @Column()
  userId: string;

  @Column()
  hintOrder: number;

  @Column({ type: 'int', default: 1 })
  tokenCost: number;

  @CreateDateColumn()
  usedAt: Date;
}
