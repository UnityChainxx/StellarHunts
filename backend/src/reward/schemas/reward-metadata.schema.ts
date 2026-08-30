import { z } from 'zod';
import { isSafeHttpUrl } from '../../common/security/safe-url';

/**
 * Zod schema for `Reward.metadata`.
 *
 * Designed so that adding a new optional key does NOT break old payloads —
 * every field is `.optional()` and the schema uses `.passthrough()` so unknown
 * keys pass through without being stripped.
 */
export const rewardMetadataSchema = z
  .object({
    /** URL to the reward image / badge artwork (SSRF-safe http(s), see #318) */
    imageUrl: z
      .string()
      .url()
      .refine(isSafeHttpUrl, {
        message:
          'imageUrl must be an http(s) URL that does not point to private or reserved network destinations',
      })
      .optional(),

    /** Rarity tier of the reward */
    rarity: z
      .enum(['common', 'uncommon', 'rare', 'epic', 'legendary'])
      .optional(),

    /** How the reward was earned (e.g. puzzle name, event slug) */
    earnedFrom: z.string().optional(),

    /** On-chain token ID if the reward has been minted */
    tokenId: z.string().optional(),

    /** IPFS / Arweave URI for the reward metadata (http(s) must be SSRF-safe) */
    nftUri: z
      .string()
      .refine(
        (uri) =>
          uri.startsWith('ipfs://') ||
          uri.startsWith('ar://') ||
          isSafeHttpUrl(uri),
        {
          message:
            'nftUri must be an ipfs://, ar:// or SSRF-safe http(s) URI',
        },
      )
      .optional(),

    /** Points value when the reward type is POINTS */
    pointsValue: z.number().int().nonnegative().optional(),

    /** Expiry date for time-limited reward (ISO-8601) */
    expiresAt: z.string().datetime().optional(),

    /** Whether the reward has been viewed by the recipient */
    viewed: z.boolean().optional(),

    /** Arbitrary tags for categorisation */
    tags: z.array(z.string()).optional(),

    /** Custom attributes exposed by the reward provider */
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/** Inferred TypeScript type for reward metadata */
export type RewardMetadata = z.infer<typeof rewardMetadataSchema>;

/**
 * Validate and return a sanitised reward metadata object.
 * Throws a ZodError if validation fails.
 */
export function validateRewardMetadata(data: unknown): RewardMetadata {
  return rewardMetadataSchema.parse(data);
}

/**
 * Safely parse reward metadata, returning a default empty object on failure
 * instead of throwing. Useful when reading old records that may not conform.
 */
export function safeParseRewardMetadata(data: unknown): RewardMetadata {
  const result = rewardMetadataSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  // Return an empty metadata object for backwards compatibility
  return {};
}
