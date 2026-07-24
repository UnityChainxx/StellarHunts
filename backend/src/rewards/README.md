# Reward Module

A standalone NestJS module for managing reward distribution to users who complete challenges in StellarHunts. Supports NFT, token, badge, and points-based rewards with duplicate claim prevention and claim limits.

## Features

- **Reward Management** — Create, update, and manage rewards with flexible metadata
- **Claim Tracking** — Prevent duplicate claims and maintain full user reward history
- **Challenge Association** — Link rewards directly to specific challenges
- **Claim Limits** — Configure maximum claims per reward with automatic enforcement
- **Statistics** — Per-reward claim counts, availability status, and usage metrics
- **Soft Delete** — Deactivate rewards safely without data loss

## Database Schema

### Reward Entity

```typescript
{
  id: string;                    // Unique identifier
  name: string;                  // Reward display name
  description: string;           // Reward description
  type: RewardType;              // NFT, TOKEN, BADGE, POINTS
  metadata: Record<string, any>; // Flexible metadata (imageUrl, rarity, contractAddress)
  challengeId: string;           // Associated challenge
  isActive: boolean;             // Whether reward is available
  maxClaims: number | null;      // Maximum claims allowed (null = unlimited)
  currentClaims: number;         // Current claim count
  createdAt: Date;
  updatedAt: Date;
}
```

### RewardClaim Entity

```typescript
{
  id: string;              // Unique identifier
  userId: string;          // User who claimed
  rewardId: string;        // Associated reward
  challengeId: string;     // Associated challenge
  claimDate: Date;         // When claimed
  transactionHash: string; // Blockchain transaction hash (optional)
  status: string;          // Claim status (claimed, pending, failed)
}
```

## API Endpoints

### Create Reward

```http
POST /rewards
Content-Type: application/json

{
  "name": "StellarHunts Beginner Badge",
  "description": "Awarded for completing Easy level challenges",
  "type": "badge",
  "challengeId": "challenge-easy-001",
  "metadata": {
    "imageUrl": "https://example.com/badge.png",
    "rarity": "common"
  },
  "isActive": true,
  "maxClaims": 1000
}
```

### Read Endpoints

```
GET /rewards                          # List all rewards
GET /rewards/:id                      # Get reward by ID
GET /rewards/challenge/:challengeId   # Get rewards for a challenge
GET /rewards/claims/:id               # Get claim by ID
GET /rewards/user/:userId/claims      # Get all claims for a user
```

### Claim Reward

```http
POST /rewards/claim
Content-Type: application/json

{
  "userId": "user-123",
  "challengeId": "challenge-easy-001"
}
```

**Success (201):**
```json
{
  "id": "claim-001",
  "userId": "user-123",
  "rewardId": "reward-001",
  "challengeId": "challenge-easy-001",
  "claimDate": "2024-01-15T10:30:00Z",
  "transactionHash": null,
  "status": "claimed"
}
```

**Conflict (409):**
```json
{
  "message": "Reward already claimed",
  "error": "Conflict",
  "statusCode": 409
}
```

### Reward Statistics

```
GET /rewards/:id/stats
```

**Response:**
```json
{
  "reward": { /* reward object */ },
  "totalClaims": 25,
  "availableClaims": 75,
  "isAvailable": true
}
```

### Delete Reward

```
DELETE /rewards/:id
```

## Usage Examples

### Creating a Reward

```typescript
const newReward = await rewardsService.createReward({
  name: 'StellarHunts Master NFT',
  description: 'Exclusive NFT for completing Master level',
  type: RewardType.NFT,
  challengeId: 'challenge-master-001',
  metadata: {
    imageUrl: 'https://example.com/master-nft.png',
    rarity: 'legendary',
    contractAddress: '0x123...',
  },
  maxClaims: 100,
});
```

### Claiming a Reward

```typescript
const claim = await rewardsService.claimReward({
  userId: 'user-456',
  challengeId: 'challenge-easy-001',
});

if (claim) {
  console.log(`Reward claimed. Claim ID: ${claim.id}`);
}
```

### Checking Claim Status

```typescript
const hasClaimed = await rewardsService.hasUserClaimedReward(
  'user-456',
  'challenge-easy-001',
);
```

### Retrieving User Reward History

```typescript
const userClaims = await rewardsService.getUserClaims('user-456');
userClaims.forEach((claim) => {
  console.log(`- ${claim.reward.name} (${claim.claimDate})`);
});
```

## Error Handling

| Status | Scenario |
|--------|----------|
| 400 | Invalid input or reward limit reached |
| 404 | Reward or claim not found |
| 409 | Reward already claimed by user |
| 500 | Database or system error |

## Testing

```bash
# Unit tests
npm run test rewards.service.spec.ts
npm run test rewards.controller.spec.ts

# E2E tests
npm run test:e2e rewards.e2e-spec.ts
```

## Database Migrations

The module uses TypeORM with automatic schema synchronization. For production environments, create explicit migrations:

```bash
npm run typeorm:generate-migration -- -n CreateRewardsTables
npm run typeorm:run-migrations
```

## Security Considerations

1. **Input Validation** — All inputs validated via class-validator
2. **Duplicate Prevention** — Unique constraints prevent duplicate claims
3. **Soft Delete** — Rewards are deactivated rather than permanently removed
4. **Transaction Safety** — Claim operations are atomic database transactions
5. **Rate Limiting** — Consider applying rate limits to claim endpoints in production

## Frontend Integration

```typescript
import axios from 'axios';

const claimReward = async (userId: string, challengeId: string) => {
  try {
    const response = await axios.post('/rewards/claim', { userId, challengeId });
    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('Reward already claimed');
    }
  }
};
```
