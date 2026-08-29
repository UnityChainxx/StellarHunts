import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF protections for external URLs (issue #318).
 *
 * URLs accepted by the backend (Stellar RPC endpoints, reward metadata,
 * challenge artwork, imported data, …) must:
 * - use an approved scheme (`http`/`https`; non-HTTP schemes such as `file:`,
 *   `ftp:`, `gopher:` are rejected),
 * - not carry userinfo (`https://user:pass@host` is rejected),
 * - not point at private, loopback, link-local, reserved or multicast
 *   destinations — either via an IP literal or via a hostname that resolves
 *   to one (checked with {@link assertSafeResolvedHost} before fetching).
 */

/** IPv4 ranges that must never be fetched by the server. */
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [start: number, end: number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8        – "this network"
  [0x0a000000, 0x0affffff], // 10.0.0.0/8       – private
  [0x64400000, 0x647fffff], // 100.64.0.0/10    – CGNAT
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8      – loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16   – link-local (incl. cloud metadata)
  [0xac100000, 0xac1fffff], // 172.16.0.0/12    – private
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24     – IETF protocol assignments
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24     – TEST-NET-1
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16   – private
  [0xc6120000, 0xc633ffff], // 198.18.0.0/15    – benchmarking
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24  – TEST-NET-2
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24   – TEST-NET-3
  [0xe0000000, 0xffffffff], // 224.0.0.0/4      – multicast + reserved
];

/** Hostname suffixes that only make sense on the local machine / LAN. */
const BLOCKED_HOSTNAME_SUFFIXES = [
  'localhost',
  '.localhost',
  '.localdomain',
  '.local',
  '.lan',
  '.corp',
  '.internal',
  '.home.arpa',
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const numeric = ipv4ToInt(ip);
  if (numeric === null) return false; // not a valid IPv4 literal
  return BLOCKED_IPV4_RANGES.some(([start, end]) => numeric >= start && numeric <= end);
}

function isBlockedIpv6(address: string): boolean {
  const lower = address.toLowerCase();

  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:aabb:ccdd).
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (mapped.includes('.')) {
      return isBlockedIpv4(mapped);
    }
    // Two hex groups, e.g. ::ffff:7f00:1 -> 127.0.0.1.
    const groups = mapped.split(':');
    if (groups.length === 2) {
      const a = parseInt(groups[0], 16);
      const b = parseInt(groups[1], 16);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        return isBlockedIpv4(`${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`);
      }
    }
    return false;
  }

  // Unspecified and loopback.
  if (
    lower === '::' ||
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:0' ||
    lower === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  const firstHextet = lower.split(':')[0] ?? '';

  // fe80::/10 – link-local.
  if (
    firstHextet.startsWith('fe8') ||
    firstHextet.startsWith('fe9') ||
    firstHextet.startsWith('fea') ||
    firstHextet.startsWith('feb')
  ) {
    return true;
  }
  // fc00::/7 – unique local.
  if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) {
    return true;
  }
  // ff00::/8 – multicast.
  if (firstHextet.startsWith('ff')) {
    return true;
  }
  // 64:ff9b::/96 – NAT64 well-known prefix.
  if (lower.startsWith('64:ff9b:')) {
    return true;
  }

  return false;
}

function isBlockedIpLiteral(hostname: string): boolean {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return isBlockedIpv4(hostname);
  if (ipVersion === 6) return isBlockedIpv6(hostname);
  return false;
}

/**
 * Return `true` when `value` is an http(s) URL that the backend is allowed to
 * fetch: approved scheme, no userinfo, and a hostname that is neither a
 * private/reserved IP literal nor a loopback/local-machine name.
 */
export function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  if (url.username !== '' || url.password !== '') {
    return false;
  }

  // Node's URL keeps the surrounding brackets on IPv6 hosts (e.g. `[::1]`),
  // which breaks `net.isIP`; strip them before any hostname checks.
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === '') {
    return false;
  }

  if (isBlockedIpLiteral(hostname)) {
    return false;
  }

  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(suffix))) {
    return false;
  }

  return true;
}

/** Throw a `BadRequestException` when `value` is not an allowed http(s) URL. */
export function assertSafeHttpUrl(value: unknown, field = 'url'): void {
  if (!isSafeHttpUrl(value)) {
    throw new BadRequestException(
      `${field} must be an http(s) URL that does not point to private, loopback, link-local or reserved network destinations`,
    );
  }
}

/**
 * Resolve `url`'s hostname via DNS and reject the URL if any resolved address
 * is a private/loopback/link-local/reserved IP. Use this immediately before a
 * fetch, since hostnames can point anywhere even when they look innocuous.
 */
export async function assertSafeResolvedHost(url: string, field = 'url'): Promise<void> {
  assertSafeHttpUrl(url, field);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException(`${field} is not a valid URL`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    return; // IP literal already validated by assertSafeHttpUrl
  }

  let addresses: string[];
  try {
    const result = await lookup(hostname, { all: true, verbatim: true });
    addresses = result.map((entry) => entry.address);
  } catch {
    throw new BadRequestException(`${field} hostname could not be resolved`);
  }

  for (const address of addresses) {
    const version = isIP(address);
    if (version === 4 && isBlockedIpv4(address)) {
      throw new BadRequestException(
        `${field} resolves to a private/reserved address (${address})`,
      );
    }
    if (version === 6 && isBlockedIpv6(address)) {
      throw new BadRequestException(
        `${field} resolves to a private/reserved address (${address})`,
      );
    }
  }
}
