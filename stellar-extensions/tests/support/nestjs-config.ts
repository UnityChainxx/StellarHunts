/**
 * Test-only CommonJS shim for `@nestjs/config`.
 *
 * `@nestjs/config` v12 is published as pure ESM, which Jest cannot require.
 * The services under test only use `ConfigService.get()`, and the specs pass a
 * plain `{ get }` stub, so this class only needs to exist for module loading.
 */

export class ConfigService {
  get<T = unknown>(_key: string, defaultValue?: T): T | undefined {
    return defaultValue;
  }
}

export default ConfigService;
