// Response-only DTO (issue #529): this shape is never bound as a @Body()
// request type, so it carries no class-validator decorators by design.
export class ReferralStatsDto {
  totalInvites: number;
  successfulInvites: number;
  conversionRate: number;
  totalBonusEarned: number;
  pendingBonuses: number;
  processedBonuses: number;
}
