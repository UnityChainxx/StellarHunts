import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { Wallet } from './entities/wallet.entity';
import { ConsumedWalletNonce } from './entities/consumed-nonce.entity';

const CHALLENGE_DOMAIN_KEY = 'domain';
const DEFAULT_DOMAIN = 'stellar-hunts.app';
const DEFAULT_TTL_SECONDS = 300;

export interface WalletChallenge {
  message: string;
  nonce: string;
  expiresAt: Date;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(ConsumedWalletNonce)
    private readonly consumedNonceRepository: Repository<ConsumedWalletNonce>,
  ) {}

  async linkWallet(address: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({ where: { address } });
    if (!wallet) {
      wallet = this.walletRepository.create({ address });
      await this.walletRepository.save(wallet);
    }
    return wallet;
  }

  async findByAddress(address: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { address } });
  }

  /**
   * Build a challenge for a wallet to sign. The challenge is bound to the
   * wallet address, an optional user, a domain, and an expiration time, and
   * includes a random nonce. The resulting signature cannot be replayed on
   * another wallet, user, domain, or after expiry.
   */
  createChallenge(
    walletAddress: string,
    userId?: string,
    domain: string = DEFAULT_DOMAIN,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): WalletChallenge {
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const message = [
      'stellar-hunts: authenticate',
      `wallet=${walletAddress}`,
      `nonce=${nonce}`,
      `user=${userId ?? 'none'}`,
      `${CHALLENGE_DOMAIN_KEY}=${domain}`,
      `expires=${expiresAt.toISOString()}`,
    ].join('\n');
    return { message, nonce, expiresAt };
  }

  /**
   * Verify a wallet signature with replay protection.
   *
   * Accepts the signed challenge message and returns `true` only when:
   *  - the signature is a valid ed25519 signature over the message bytes made
   *    by the wallet's public key,
   *  - the message embeds a nonce that has not been consumed before,
   *  - the message is bound to the same wallet and (when bound) user,
   *  - the message is bound to the expected domain,
   *  - the message has not expired.
   *
   * On success the nonce is persisted as consumed so the same signature cannot
   * be replayed.
   */
  async verifySignature(
    walletAddress: string,
    signature: string,
    message: string,
    opts?: {
      userId?: string;
      domain?: string;
    },
  ): Promise<{ valid: boolean; error?: string }> {
    const expectedDomain = opts?.domain ?? DEFAULT_DOMAIN;

    const fields = this.parseChallenge(message);
    if (!fields) {
      return { valid: false, error: 'Malformed challenge message' };
    }

    if (fields.wallet !== walletAddress) {
      return {
        valid: false,
        error: 'Message not bound to this wallet',
      };
    }

    if (fields.domain !== expectedDomain) {
      return {
        valid: false,
        error: 'Message bound to an unexpected domain',
      };
    }

    const expires = Date.parse(fields.expires);
    if (Number.isNaN(expires)) {
      return { valid: false, error: 'Challenge has no expiration' };
    }
    if (expires <= Date.now()) {
      return { valid: false, error: 'Challenge has expired' };
    }

    if (opts?.userId) {
      if (fields.user !== opts.userId) {
        return { valid: false, error: 'Message not bound to this user' };
      }
    }

    // Replay protection: reject if the nonce was already consumed.
    if (fields.nonce) {
      const consumed = await this.consumedNonceRepository.findOne({
        where: { nonce: fields.nonce },
      });
      if (consumed) {
        return { valid: false, error: 'Challenge already used (replay)' };
      }
    } else {
      return { valid: false, error: 'Challenge has no nonce' };
    }

    // Cryptographic verification: ed25519 signature over the message bytes.
    let valid = false;
    try {
      const messageBytes = Buffer.from(message, 'utf8');
      const signatureBytes = Buffer.from(signature, 'base64');
      const keypair = Keypair.fromPublicKey(walletAddress);
      valid = keypair.verify(messageBytes, signatureBytes);
    } catch {
      valid = false;
    }

    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Mark the nonce as consumed to prevent replays. The unique constraint on
    // `nonce` is the authoritative guard: a concurrent duplicate reject is
    // treated the same as a replayed signature.
    try {
      await this.consumedNonceRepository.save(
        this.consumedNonceRepository.create({
          nonce: fields.nonce,
          walletAddress,
          userId: opts?.userId,
          domain: expectedDomain,
          consumedAt: new Date(),
        }),
      );
    } catch (err: unknown) {
      const isDuplicate =
        (err as { code?: string | number })?.code === 'ER_DUP_ENTRY' ||
        (err as { code?: string | number })?.code === 'SQLITE_CONSTRAINT' ||
        (err as { code?: string | number })?.code === '23505';
      if (isDuplicate) {
        return { valid: false, error: 'Challenge already used (replay)' };
      }
      throw err;
    }

    return { valid: true };
  }

  private parseChallenge(
    message: string,
  ): {
    wallet?: string;
    nonce?: string;
    user?: string;
    domain?: string;
    expires?: string;
  } | null {
    if (!message || typeof message !== 'string') {
      return null;
    }
    const lines = message.split('\n');
    if (!lines[0]?.startsWith('stellar-hunts: authenticate')) {
      return null;
    }
    const out: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      out[line.slice(0, idx)] = line.slice(idx + 1);
    }
    if (!out.wallet || !out.nonce || !out.domain || !out.expires) {
      return null;
    }
    return {
      wallet: out.wallet,
      nonce: out.nonce,
      user: out.user ?? 'none',
      domain: out.domain,
      expires: out.expires,
    };
  }
}