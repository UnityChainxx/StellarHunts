import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Auth logging hygiene (issue #547)
//
// Registration and login failures used to be reported with `console.error`,
// which bypasses Nest's logger entirely: no level filtering, no redaction, and
// no correlation with the request that failed. Worse, the error object was
// passed straight through, and driver errors quote the offending value in
// their text -- a Postgres unique violation on `email` embeds the submitted
// address -- so a submitted email or password could reach the log.
//
// `AuthService` now owns auth-failure logging: one correlated entry per
// failure, carrying the error class but neither the error message nor any
// submitted value. `AuthController` no longer logs, so one failure still means
// one entry. `User.validatePassword` was a fifth `console.error` that the issue
// did not list; it is covered here too.
//
// These checks read the source as text on purpose. `auth.service.spec.ts`
// cannot run: it does not compile (`Repository` is never imported and
// `savedUser` is undefined), and `AuthService` itself does not compile either,
// because `genericRegistrationMessage` is called twice and never defined.
// `tsc --noEmit` reports those on a clean checkout of main. Asserting the
// behaviour at runtime is therefore impossible until that is fixed, and a
// source-level guard is what can be enforced today.
// ─────────────────────────────────────────────────────────────────────────

const AUTH_ROOT = resolve(__dirname);
const CONTROLLER = join(AUTH_ROOT, 'controllers', 'auth.controller.ts');
const SERVICE = join(AUTH_ROOT, 'services', 'auth.service.ts');
const USER_ENTITY = join(AUTH_ROOT, 'entities', 'user.entity.ts');

function authSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...authSources(full));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

const sources = authSources(AUTH_ROOT);
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(AUTH_ROOT, file);

const CONSOLE_CALL = /(^|[^.\w])console\s*\.\s*(log|info|warn|error|debug|trace)\s*\(/g;

describe('auth module logging hygiene', () => {
  it('scans the whole auth module, not just the files it changes', () => {
    const rels = sources.map(rel);
    expect(rels).toEqual(
      expect.arrayContaining([
        'controllers/auth.controller.ts',
        'entities/user.entity.ts',
        'services/auth.service.ts',
      ]),
    );
    // dto/, enums/, guards/, middleware/ and strategies/ are in scope too, so a
    // console call added to any of them is caught as well.
    expect(rels.length).toBeGreaterThan(3);
  });

  it('leaves no console.* call in backend/src/auth', () => {
    const offenders = sources
      .filter((file) => {
        CONSOLE_CALL.lastIndex = 0;
        return CONSOLE_CALL.test(read(file));
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('logs no submitted value and no error message', () => {
    // The strings are composed in a local and then handed to the logger, so
    // inspecting only the logger's argument would inspect a variable name and
    // miss the leak. Scan every interpolated expression in the module
    // instead: those holes are the only places a runtime value can enter a
    // log line. Literal template text is chosen by us and may legitimately
    // name the event (e.g. "password_validation_failed").
    // Substring, not word-boundary, matching on purpose: credentials are
    // usually camelCase (`accessToken`, `plainTextPassword`, `userEmail`) and
    // a word boundary sits between the case change and the name, so
    // /\btoken\b/ would miss every one of them.
    const forbidden = [
      /dto/i,
      /email/i,
      /password/i,
      /token/i,
      /jwt/i,
      /secret/i,
      /credential/i,
      /salt/i,
      /\.message/,
      /\.stack\b/,
      /JSON\.stringify/,
      /^\s*error\s*$/,
    ];

    const offenders: string[] = [];
    for (const file of sources) {
      const text = read(file);
      for (const [index, line] of text.split('\n').entries()) {
        for (const hole of line.matchAll(/\$\{([^}]*)\}/g)) {
          for (const pattern of forbidden) {
            if (pattern.test(hole[1])) {
              offenders.push(`${rel(file)}:${index + 1} \${${hole[1]}} matches ${pattern}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('hands the logger a composed string, never a raw object or error', () => {
    // `this.logger.error(error)` or `this.logger.error(someObject)` would put
    // a whole value into the log. An identifier is allowed only when it is
    // assigned from a string or template literal.
    const offenders: string[] = [];
    for (const file of sources) {
      const text = read(file);
      for (const match of text.matchAll(
        /this\.logger\.(?:log|warn|error|debug|verbose)\(\s*([^;]+?)\s*\);/g,
      )) {
        const argument = match[1].trim();
        if (/^[`'"]/.test(argument)) {
          continue;
        }
        if (/^[A-Za-z_$][\w$]*$/.test(argument)) {
          const assigned = new RegExp(
            `(?:const|let)\\s+${argument}\\s*=\\s*([\\s\\S]*?);`,
          ).exec(text);
          if (assigned && /^[`'"]/.test(assigned[1].trim())) {
            continue;
          }
        }
        offenders.push(`${rel(file)}: this.logger.*(${argument})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('one entry per failure', () => {
  it('leaves auth-failure logging to the service alone', () => {
    const controller = read(CONTROLLER);
    expect(controller).not.toMatch(/this\.logger\./);
    expect(controller).not.toMatch(/new Logger\(/);
    // The two log-and-rethrow wrappers are gone rather than reworded.
    expect(controller).not.toMatch(/catch\s*\(\s*error\s*\)/);
  });

  it('logs each distinct auth failure at exactly one call site', () => {
    const service = read(SERVICE);
    const reasons = [...service.matchAll(/logAuthFailure\(\s*'(\w+)',\s*'([a-z_]+)'/g)].map(
      (match) => `${match[1]}:${match[2]}`,
    );

    expect(reasons.sort()).toEqual([
      'login:invalid_credentials',
      'login:unexpected',
      'register:duplicate_identifier',
      'register:unexpected',
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('defines the helper once and tags every entry with a correlation id', () => {
    const service = read(SERVICE);
    expect(service.match(/private logAuthFailure\(/g) || []).toHaveLength(1);
    expect(service).toMatch(/correlationId=\$\{crypto\.randomUUID\(\)\}/);
  });

  it('separates caller-triggered outcomes from unexpected failures', () => {
    const service = read(SERVICE);
    // Invalid credentials and duplicate identifiers are reachable by any
    // untrusted caller, so they must not be logged at error level.
    expect(service).toMatch(/'invalid_credentials',\s*error,\s*'warn'\)/);
    expect(service).toMatch(/'duplicate_identifier',\s*error,\s*'warn'\)/);
    expect(service).toMatch(/'unexpected',\s*error\)/);
  });
});

describe('password comparison', () => {
  it('reports a failed comparison without echoing either password', () => {
    const entity = read(USER_ENTITY);
    expect(entity).toMatch(/this\.logger\.warn\(/);
    expect(entity).toMatch(/password_validation_failed/);
    expect(entity).toMatch(/correlationId=\$\{randomUUID\(\)\}/);
    // The catch must still fail closed.
    expect(entity).toMatch(/return false;/);
  });
});
