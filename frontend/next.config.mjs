import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOWED_IMAGE_HOSTS } from './lib/images.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remote badge images are only optimised for hosts we explicitly trust.
  // The allow-list lives in `lib/images.js` so the runtime check in components
  // and this build-time configuration can never drift apart. Wildcards are
  // deliberately not used — they would let any host reach the optimiser.
  images: {
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((hostname) => ({
      protocol: 'https',
      hostname,
    })),
  },
  webpack: (config) => {
    config.resolve.alias['@'] = rootDir;
    config.resolve.alias['@/'] = `${rootDir}/`;
    config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    return config;
  },
};

export default nextConfig;
