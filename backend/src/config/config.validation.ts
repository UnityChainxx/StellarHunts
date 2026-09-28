import * as Joi from 'joi';

/**
 * The startup environment contract.
 *
 * This module is the single definition of the Joi schema that
 * `ConfigModule.forRoot()` validates the process environment against at
 * startup. It is imported by `src/app.module.ts` (which is what actually
 * gates boot) and by `src/config/config-validation.spec.ts` (which asserts
 * the behaviour of the schema the application really loads).
 *
 * It used to be the other way round: the schema lived inline in
 * `app.module.ts` and the spec re-declared a copy of it. The copy drifted
 * (duplicate `NODE_ENV` key, no live-mode rules, no Redis/Stellar keys), so
 * the suite could pass while saying nothing about the schema that runs, or
 * fail to compile at all. Extracting the schema makes that class of drift
 * impossible rather than merely unlikely.
 */

/**
 * Joi validation options for the startup schema.
 *
 * `@nestjs/config` v12 validates through the Standard Schema interface, so
 * `src/app.module.ts` passes these nested under `validationOptions.libraryOptions`
 * (Joi's own options do not belong at the top level of a Standard Schema
 * options object). They are set explicitly rather than left to the package
 * defaults — which happen to be identical — so that the options exercised by
 * `config-validation.spec.ts` are provably the options the application uses.
 *
 * - `abortEarly: false` reports every invalid key at once instead of only the
 *   first, so a misconfigured deployment is fixed in one pass.
 * - `allowUnknown: true` keeps variables this schema does not model (e.g.
 *   `DATABASE_MIGRATIONS_RUN`, consumed directly in `config/database.config.ts`)
 *   from blocking startup. Unknown keys are still rejected with
 *   `allowUnknown: false` in the spec, which is how the schema is held
 *   accountable for covering everything `.env.example` documents.
 */
export const validationOptions = {
  allowUnknown: true,
  abortEarly: false,
} as const;

/**
 * A Soroban contract id, e.g. `CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE`.
 *
 * Declared so that `SOROBAN_*` / `STELLAR_HUNTS_*` contract ids get a real
 * type in the schema and in the emitted `docs/openapi.json`-adjacent
 * tooling, and so a malformed id is rejected at startup rather than at the
 * first on-chain call. Left unconstrained beyond `required()` in live mode:
 * the authoritative check for a deployed contract id lives with the Stellar
 * client, not with configuration parsing.
 */
const contractId = Joi.string().trim().min(1);

/**
 * Configuration required only when `STELLAR_MODE=live`.
 *
 * Rationale for enforcing this in the schema rather than leaving it to the
 * first RPC call: with `STELLAR_MODE` unset the schema default is `live`
 * (see `STELLAR_MODE_DEFAULT` below), so a deployment that forgets to set
 * the variable and has not provisioned Soroban would otherwise boot
 * "successfully" and then fail on the first claim with an error that points
 * at the network rather than at the missing configuration. Failing at
 * startup, naming every missing key, is the diagnosable outcome.
 *
 * `mock` mode deliberately does not require them, which is what makes the
 * template in `backend/.env.example` usable with no Stellar setup at all.
 */
const liveModeOnly = <T extends Joi.Schema>(schema: T) =>
  schema.when('STELLAR_MODE', {
    is: 'live',
    then: schema.required(),
  });

/**
 * The default for `STELLAR_MODE`.
 *
 * This is `live`, and that is a deliberate fail-closed choice rather than an
 * oversight (issue #492). The two candidates were `mock` (the value
 * `README.md` and `backend/.env.example` previously documented as the local
 * default) and `live` (the value the code actually applied).
 *
 * `live` is kept because the failure modes are not symmetric:
 *
 * - Defaulting to `live`: a deployment that omits `STELLAR_MODE` without
 *   Soroban credentials fails at startup, with the missing keys named. Noisy
 *   and immediately actionable.
 * - Defaulting to `mock`: the same deployment boots clean, serves traffic,
 *   and `StellarHandlerService` returns a *synthetic success* for every NFT
 *   claim (`src/nft-claim/providers/stellar-handler.service.ts`). Users get
 *   badges that were never minted, and the divergence is invisible until
 *   someone reconciles against the chain. That is a silent data-integrity
 *   failure in a rewards product, which is strictly worse than a boot error.
 *
 * A secondary guard already exists at the other end:
 * `StellarHandlerService` rejects `STELLAR_MODE=mock` when
 * `NODE_ENV=production`, so the dangerous direction is closed from both ends.
 *
 * The cost of this choice is that local development must opt in explicitly,
 * so `README.md` and `backend/.env.example` now set `STELLAR_MODE=mock` in
 * their example blocks and state that it is not the default. Both documents,
 * and this constant, are asserted to agree by
 * `config-validation.spec.ts`.
 */
export const STELLAR_MODE_DEFAULT = 'live';

/**
 * The startup validation schema. One definition, imported by the application
 * and asserted by the spec.
 */
export const validationSchema = Joi.object({
  // ── Application ──────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // ── Auth ─────────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // ── Database ─────────────────────────────────────────────────────────
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  // Booleans are compared against the literal string 'true' in
  // `config/database.config.ts`, so they are validated as booleans here to
  // keep the two in agreement: `DATABASE_SYNC=yes` is a typo that would
  // otherwise silently disable schema synchronisation.
  DATABASE_SYNC: Joi.boolean().default(false),
  DATABASE_LOAD: Joi.boolean().default(false),

  // ── Stellar / Soroban ────────────────────────────────────────────────
  STELLAR_MODE: Joi.string()
    .valid('mock', 'live')
    .default(STELLAR_MODE_DEFAULT),
  // Stellar's public network is `pubnet`. `mainnet` appeared in
  // `backend/.env.example` and was rejected by this schema, which meant the
  // documented local configuration could not actually be used; the template
  // now says `pubnet` and notes the old name.
  STELLAR_NETWORK: Joi.string().valid('testnet', 'pubnet').default('testnet'),
  // The authoritative protocol/host policy for this URL is the SSRF guard in
  // `StellarHandlerService`; the schema only asserts it is a URL so that the
  // startup error names configuration rather than a network fault.
  SOROBAN_RPC_URL: liveModeOnly(Joi.string().uri()),
  SOROBAN_NFT_CONTRACT_ID: liveModeOnly(contractId),
  STELLAR_HUNTS_CONTRACT_ID: liveModeOnly(contractId),
  STELLAR_HUNTS_NFT_CONTRACT_ID: liveModeOnly(contractId),

  // ── Redis (optional — the app boots with degraded caching when unset) ─
  REDIS_URL: Joi.string().allow('').default(''),
  REDIS_HOST: Joi.string().allow('').default(''),
  REDIS_PORT: Joi.alternatives()
    .try(Joi.number().port(), Joi.valid(''))
    .default(''),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.alternatives()
    .try(Joi.number().integer().min(0), Joi.valid(''))
    .default(''),
});
