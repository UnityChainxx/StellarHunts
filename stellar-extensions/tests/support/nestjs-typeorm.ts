/**
 * Test-only CommonJS shim for `@nestjs/typeorm`.
 *
 * The pinned `@nestjs/typeorm` release ships as pure ESM, which Jest (CJS mode)
 * cannot `require()`. The extension specs construct services directly and pass
 * in-memory repositories, so only the decorator/token surface is needed.
 *
 * Wired up via `moduleNameMapper` in `tests/jest.config.js`.
 */

export const InjectRepository = (..._args: unknown[]) => () => undefined;

export const InjectDataSource = (..._args: unknown[]) => () => undefined;

export const getRepositoryToken = (entity: { name?: string } | string) =>
  `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;

export const getDataSourceToken = () => 'DataSource';

export const TypeOrmModule = {
  forFeature: () => ({ module: class TypeOrmFeatureModule {} }),
  forRoot: () => ({ module: class TypeOrmRootModule {} }),
  forRootAsync: () => ({ module: class TypeOrmRootAsyncModule {} }),
};
