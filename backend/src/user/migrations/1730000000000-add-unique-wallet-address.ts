import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class AddUniqueWalletAddress1730000000000 implements MigrationInterface {
  name = 'AddUniqueWalletAddress1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createUniqueConstraint(
      'users',
      new TableUnique({
        name: 'UQ_USERS_WALLET_ADDRESS',
        columnNames: ['wallet_address'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint(
      'users',
      'UQ_USERS_WALLET_ADDRESS',
    );
  }
}
