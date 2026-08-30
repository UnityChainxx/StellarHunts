import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';

// Replicates the global ValidationPipe options configured in main.ts
// (issue #335) so we can unit-test the rejection behavior without booting
// the full NestJS DI container.
const globalPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

class SampleDto {
  @IsString()
  name!: string;
}

describe('Global ValidationPipe (main.ts)', () => {
  it('accepts payloads that only contain whitelisted properties', async () => {
    const value = await globalPipe.transform(
      { name: 'Ada' },
      { type: 'body', metatype: SampleDto },
    );
    expect(value).toEqual({ name: 'Ada' });
  });

  it('rejects payloads containing unexpected fields', async () => {
    const rejection = globalPipe.transform(
      { name: 'Ada', role: 'admin' },
      { type: 'body', metatype: SampleDto },
    );
    await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
    await expect(rejection).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: ['property role should not exist'],
      },
    });
  });

  it('rejects payloads containing multiple unexpected fields', async () => {
    const rejection = globalPipe.transform(
      { name: 'Ada', role: 'admin', extra: true },
      { type: 'body', metatype: SampleDto },
    );
    await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
    await expect(rejection).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: [
          'property role should not exist',
          'property extra should not exist',
        ],
      },
    });
  });

  it('strips unknown properties when forbidNonWhitelisted is disabled', async () => {
    const lenientPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });
    const value = await lenientPipe.transform(
      { name: 'Ada', role: 'admin' },
      { type: 'body', metatype: SampleDto },
    );
    expect(value).toEqual({ name: 'Ada' });
  });
});
