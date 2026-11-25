import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn } from 'typeorm';

@Entity('puzzle_tags')
export class PuzzleTag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 64 })
  name: string;

  @Column({ default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
