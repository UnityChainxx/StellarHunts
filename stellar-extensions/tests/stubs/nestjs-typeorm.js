/**
 * Jest stand-in for `@nestjs/typeorm`.
 *
 * The real package lives in `backend/node_modules` (it is a backend-only
 * dependency) and is ESM-only, so it cannot be resolved or required from the
 * extension test workspace. The wallet services only need the decorators at
 * import time; the tests construct the services manually with in-memory
 * repositories.
 */

const noopDecorator = () => () => undefined;

class TypeOrmModule {}

TypeOrmModule.forRoot = () => ({ module: TypeOrmModule });
TypeOrmModule.forRootAsync = () => ({ module: TypeOrmModule });
TypeOrmModule.forFeature = () => ({ module: TypeOrmModule });

module.exports = {
  InjectRepository: noopDecorator,
  InjectEntityManager: noopDecorator,
  InjectDataSource: noopDecorator,
  TypeOrmModule,
};
