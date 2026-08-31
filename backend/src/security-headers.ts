import type { HelmetOptions } from 'helmet';

/**
 * Centralised Helmet configuration shared between `bootstrap()` in
 * `main.ts` and the security-headers regression test
 * (`backend/test/security-headers.e2e-spec.ts`).
 *
 * Keeping the config here (rather than inline in `main.ts`) lets the e2e
 * suite lock the exact production header contract so a future change to
 * CSP/HSTS/frame/referrer policy cannot silently regress. See issue #303.
 */
export const securityHeadersConfig: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://soroban-testnet.stellar.org'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
};
