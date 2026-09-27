import * as path from 'path';

import {
  LEGACY_ENTITY_DIRS,
  findUnregisteredEntities,
  listEntityClasses,
} from './entity-registration';

const SRC_DIR = path.resolve(__dirname, '..');

describe('entity registration audit', () => {
  it('discovers the entity classes in the source tree', () => {
    const entities = listEntityClasses(SRC_DIR);
    expect(entities.length).toBeGreaterThan(40);
    expect(entities.some((entity) => entity.name === 'User')).toBe(true);
  });

  it('excludes the unwired legacy game-mechanic entities', () => {
    const entities = listEntityClasses(SRC_DIR);
    expect(
      entities.some((entity) => entity.file.includes('game-mechanic')),
    ).toBe(false);
    expect(LEGACY_ENTITY_DIRS).toContain('game-mechanic');
  });

  it('every entity is registered by a TypeOrmModule.forFeature call', () => {
    const unregistered = findUnregisteredEntities(SRC_DIR);

    expect(
      unregistered.map((entity) => entity.name),
    ).toEqual([]);
  });
});
