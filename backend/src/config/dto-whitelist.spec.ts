import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AssignBadgeDto } from '../badge/dto/assign-badge.dto';
import { CreateReportCardBodyDto } from '../user-report-card/dto/report-card.dto';

// Replicates the global ValidationPipe options configured in main.ts so the
// assertions below exercise exactly what production requests go through
// (issue #529).
const globalPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const context = { type: 'body' as const };

describe('Request DTO whitelisting (issue #529)', () => {
  it('rejects an empty body when the request DTO has required fields', async () => {
    // Before #529 AssignBadgeDto had no decorators: the pipe silently
    // stripped the whole body and the handler saw {}.
    await expect(
      globalPipe.transform({}, { ...context, metatype: AssignBadgeDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a wrongly-typed field on a required request DTO', async () => {
    await expect(
      globalPipe.transform(
        { userId: 'not-a-number', badgeId: 1 },
        { ...context, metatype: AssignBadgeDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an empty body for an all-optional request DTO but rejects unknown fields', async () => {
    // The report-card create endpoint takes its user id from the route
    // param; the body only carries optional overrides.
    await expect(
      globalPipe.transform({}, { ...context, metatype: CreateReportCardBodyDto }),
    ).resolves.toBeInstanceOf(CreateReportCardBodyDto);

    await expect(
      globalPipe.transform(
        { userId: 42 },
        { ...context, metatype: CreateReportCardBodyDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
