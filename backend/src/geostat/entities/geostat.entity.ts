import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('geostat')
export class GeoStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ipAddress: string;

  @Column()
  country: string;

  @CreateDateColumn()
  timestamp: Date;
}
