/**
 * Audit script that fails when a TypeORM entity is not registered by any
 * feature module.
 *
 * `AppModule` uses `autoLoadEntities: true`, so an entity is only added to the
 * connection when a module calls `TypeOrmModule.forFeature([...])`. An entity
 * that is never registered silently fails at runtime with an
 * `EntityMetadataNotFoundError` the first time a controller touches it.
 *
 * Run: npx ts-node scripts/audit-entities.ts
 */
import * as path from 'path';

import { findUnregisteredEntities } from '../src/common/entity-registration';

const SRC_DIR = path.resolve(__dirname, '../src');

function main() {
  const unregistered = findUnregisteredEntities(SRC_DIR);

  if (unregistered.length > 0) {
    console.error(
      'Entity classes NOT registered by any TypeOrmModule.forFeature call:',
    );
    unregistered.forEach((entity) =>
      console.error(
        `  - ${entity.name} (${path.relative(process.cwd(), entity.file)})`,
      ),
    );
    console.error(
      '\nRegister each entity with TypeOrmModule.forFeature in its feature module.',
    );
    process.exit(1);
  }

  console.log('All entity classes are registered by a feature module.');
  process.exit(0);
}

main();
