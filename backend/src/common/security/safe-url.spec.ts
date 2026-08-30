import { BadRequestException } from '@nestjs/common';
import {
  isSafeHttpUrl,
  assertSafeHttpUrl,
  assertSafeResolvedHost,
} from './safe-url';

describe('safe-url (SSRF protection)', () => {
  describe('isSafeHttpUrl', () => {
    it('accepts public https URLs', () => {
      expect(isSafeHttpUrl('https://soroban-testnet.stellar.org')).toBe(true);
      expect(isSafeHttpUrl('https://example.com/image.png')).toBe(true);
      expect(isSafeHttpUrl('https://example.com/a/b?q=1#frag')).toBe(true);
    });

    it('accepts public http URLs', () => {
      expect(isSafeHttpUrl('http://example.com/image.png')).toBe(true);
    });

    it('rejects non-http(s) schemes', () => {
      expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeHttpUrl('ftp://example.com/file')).toBe(false);
      expect(isSafeHttpUrl('gopher://example.com')).toBe(false);
      expect(isSafeHttpUrl('ipfs://QmHash')).toBe(false);
      expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects URLs with userinfo', () => {
      expect(isSafeHttpUrl('https://user:pass@example.com/')).toBe(false);
      expect(isSafeHttpUrl('https://user@example.com/')).toBe(false);
    });

    it('rejects loopback and local-machine hostnames', () => {
      expect(isSafeHttpUrl('http://localhost:8000')).toBe(false);
      expect(isSafeHttpUrl('http://localhost.localdomain/')).toBe(false);
      expect(isSafeHttpUrl('http://myhost.local/')).toBe(false);
      expect(isSafeHttpUrl('http://internal.corp/')).toBe(false);
    });

    it('rejects private and reserved IPv4 literals', () => {
      expect(isSafeHttpUrl('http://127.0.0.1/')).toBe(false);
      expect(isSafeHttpUrl('http://10.0.0.5/')).toBe(false);
      expect(isSafeHttpUrl('http://172.16.0.1/')).toBe(false);
      expect(isSafeHttpUrl('http://192.168.1.1/')).toBe(false);
      expect(isSafeHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(isSafeHttpUrl('http://0.0.0.0/')).toBe(false);
      expect(isSafeHttpUrl('http://100.64.0.1/')).toBe(false);
    });

    it('rejects private and reserved IPv6 literals', () => {
      expect(isSafeHttpUrl('http://[::1]/')).toBe(false);
      expect(isSafeHttpUrl('http://[::]/')).toBe(false);
      expect(isSafeHttpUrl('http://[fc00::1]/')).toBe(false);
      expect(isSafeHttpUrl('http://[fe80::1]/')).toBe(false);
      expect(isSafeHttpUrl('http://[::ffff:127.0.0.1]/')).toBe(false);
      expect(isSafeHttpUrl('http://[::ffff:7f00:1]/')).toBe(false);
      expect(isSafeHttpUrl('http://[64:ff9b::1]/')).toBe(false);
    });

    it('accepts public IP literals', () => {
      expect(isSafeHttpUrl('http://8.8.8.8/')).toBe(true);
      expect(isSafeHttpUrl('http://1.1.1.1/')).toBe(true);
      expect(isSafeHttpUrl('http://[2606:4700:4700::1111]/')).toBe(true);
    });

    it('rejects malformed input', () => {
      expect(isSafeHttpUrl('')).toBe(false);
      expect(isSafeHttpUrl('not a url')).toBe(false);
      expect(isSafeHttpUrl('https://')).toBe(false);
      expect(isSafeHttpUrl(null)).toBe(false);
      expect(isSafeHttpUrl(42)).toBe(false);
    });
  });

  describe('assertSafeHttpUrl', () => {
    it('throws BadRequestException for blocked URLs', () => {
      expect(() => assertSafeHttpUrl('http://169.254.169.254/')).toThrow(
        BadRequestException,
      );
      expect(() => assertSafeHttpUrl('file:///etc/passwd')).toThrow(
        BadRequestException,
      );
    });

    it('does not throw for safe URLs', () => {
      expect(() =>
        assertSafeHttpUrl('https://example.com/image.png'),
      ).not.toThrow();
    });
  });

  describe('assertSafeResolvedHost', () => {
    it('rejects hostnames resolving to private addresses', async () => {
      await expect(
        assertSafeResolvedHost('http://localtest.me/'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a known public hostname', async () => {
      await expect(
        assertSafeResolvedHost('https://example.com/'),
      ).resolves.toBeUndefined();
    });

    it('rejects unresolvable hostnames', async () => {
      await expect(
        assertSafeResolvedHost('https://definitely-not-a-real-host-xyz.invalid/'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
