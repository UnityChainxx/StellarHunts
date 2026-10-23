import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOWED_IMAGE_HOSTS } from './lib/images.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Security Headers (Issue #783)
// ---------------------------------------------------------------------------
//
// Applied to every route via the `headers()` export.  The Content-Security-
// Policy is the most complex entry — see the inline comments for the
// rationale behind each allowed origin.
//
// IMPORTANT: Next.js static-export mode does not execute `headers()`.  If
// the project is ever switched to `output: 'export'` these headers must be
// moved to the hosting platform (e.g. Vercel/CDN config).

/**
 * Build the CSP string.
 *
 * Kept as a function so it can be imported and tested in
 * `frontend/scripts/check-security-headers.js` without executing the full
 * Next.js config.
 */
export function buildCsp() {
  const directives = [
    // Restrict everything not explicitly listed to same-origin.
    "default-src 'self'",

    // Scripts: same-origin only.  Next.js production builds do not need
    // unsafe-eval; if a third-party library reintroduces it that should be
    // an explicit, reviewed addition.
    "script-src 'self'",

    // Styles: same-origin + inline.  Next.js injects critical CSS inline;
    // removing 'unsafe-inline' here requires a nonce-based approach that is
    // not yet wired up in this project (tracked separately).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // Fonts: same-origin + Google Fonts CDN used for UI typefaces.
    "font-src 'self' https://fonts.gstatic.com",

    // Images: same-origin + data URIs (favicons / base64 thumbnails) +
    // blob (canvas exports) + HTTPS (badge images from trusted remotes,
    // controlled by ALLOWED_IMAGE_HOSTS in lib/images.js).
    "img-src 'self' data: blob: https:",

    // XHR / fetch / WebSocket connections allowed to:
    //   • same-origin (API calls to the NestJS backend via proxy)
    //   • Soroban testnet RPC (direct horizon/soroban calls from the browser)
    //   • Soroban pubnet RPC
    //   • Stellar Horizon (transaction submission)
    //   • ws:/wss: for Socket.IO in development and production respectively
    "connect-src 'self' https://soroban-testnet.stellar.org https://soroban.stellar.org https://horizon-testnet.stellar.org https://horizon.stellar.org wss: ws:",

    // Workers: same-origin + blob (some bundlers create blob-worker URLs).
    "worker-src 'self' blob:",

    // Manifests, media, objects — locked down.
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",

    // Frames — deny embedding entirely (clickjacking defence).
    "frame-src 'none'",
    "frame-ancestors 'none'",

    // Prevent base-tag injection.
    "base-uri 'self'",

    // Restrict where forms can submit.
    "form-action 'self'",

    // Force mixed-content upgrades in supporting browsers.
    "upgrade-insecure-requests",
  ];

  return directives.join('; ');
}

/**
 * The full set of security headers returned for every route.
 *
 * References:
 *   https://nextjs.org/docs/app/api-reference/next-config-js/headers
 *   https://securityheaders.com
 *   https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */
const securityHeaders = [
  // -------------------------------------------------------------------------
  // Content-Security-Policy
  // -------------------------------------------------------------------------
  {
    key: 'Content-Security-Policy',
    value: buildCsp(),
  },

  // -------------------------------------------------------------------------
  // X-Frame-Options
  // -------------------------------------------------------------------------
  // Belt-and-suspenders with frame-ancestors above; older browsers honour
  // X-Frame-Options but not the CSP directive.
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },

  // -------------------------------------------------------------------------
  // X-Content-Type-Options
  // -------------------------------------------------------------------------
  // Prevents MIME-type sniffing — browsers must respect the declared
  // Content-Type header instead of guessing.
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },

  // -------------------------------------------------------------------------
  // Referrer-Policy
  // -------------------------------------------------------------------------
  // Sends the full URL as the Referer header only to same-origin requests;
  // cross-origin requests receive only the origin (no path/query leakage).
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },

  // -------------------------------------------------------------------------
  // Permissions-Policy
  // -------------------------------------------------------------------------
  // Opts out of browser features the application does not use.
  // camera/microphone/geolocation are unnecessary for a puzzle game.
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()',
      'interest-cohort=()',
    ].join(', '),
  },

  // -------------------------------------------------------------------------
  // Strict-Transport-Security (HSTS)
  // -------------------------------------------------------------------------
  // Instructs browsers to only contact this site over HTTPS for the next
  // two years.  preload enables inclusion in browser HSTS preload lists.
  // NOTE: Only effective over HTTPS — the header is ignored over HTTP.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },

  // -------------------------------------------------------------------------
  // X-DNS-Prefetch-Control
  // -------------------------------------------------------------------------
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
];

// ---------------------------------------------------------------------------
// PR preview builds (issue #769)
// ---------------------------------------------------------------------------
//
// CI publishes per-PR previews to GitHub Pages (see
// `.github/workflows/preview.yml`). Pages only serves static files, so the
// preview build opts into `output: 'export'` via `NEXT_OUTPUT=export`, a
// sub-path base via `NEXT_PUBLIC_BASE_PATH` (e.g. `/previews/pr-123`), and
// unoptimised images (the optimiser needs a Node server). Server-only
// features (`headers()`, the `app/api` route handlers) do not run on Pages —
// `headers()` is already documented above as a server-only export, and the
// preview build script relocates `app/api` for the duration of the build.
// These settings are inert for normal `next build` / `next dev` runs.
const isStaticPreviewExport = process.env.NEXT_OUTPUT === 'export';
const previewBasePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static-export mode only for PR preview builds (issue #769).
  ...(isStaticPreviewExport ? { output: 'export', trailingSlash: true } : {}),

  // Previews live under https://<owner>.github.io/<repo>/previews/pr-<n>/,
  // so every asset path must be prefixed with the sub-path.
  ...(previewBasePath ? { basePath: previewBasePath } : {}),
  // Remote badge images are only optimised for hosts we explicitly trust.
  // The allow-list lives in `lib/images.js` so the runtime check in components
  // and this build-time configuration can never drift apart. Wildcards are
  // deliberately not used — they would let any host reach the optimiser.
  images: {
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((hostname) => ({
      protocol: 'https',
      hostname,
    })),
    // The export build has no image-optimisation server available.
    unoptimized: isStaticPreviewExport,
  },

  // ---------------------------------------------------------------------------
  // Security Headers
  // ---------------------------------------------------------------------------
  async headers() {
    return [
      {
        // Apply security headers to every route.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  webpack: (config) => {
    // Module bundler alias resolution: maps '@' and '@/' to rootDir during 'next build' and 'next dev'.
    // Complements IDE/compiler path definitions in tsconfig.json and jsconfig.json.
    config.resolve.alias['@'] = rootDir;
    config.resolve.alias['@/'] = `${rootDir}/`;
    config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    return config;
  },
};

export default nextConfig;
