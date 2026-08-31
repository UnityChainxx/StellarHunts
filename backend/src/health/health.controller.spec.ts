import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheck: HealthCheckService;
  let stellar: StellarRpcHealthIndicator;

  const redisIndicator = { pingCheck: jest.fn() };
  const dbIndicator = { pingCheck: jest.fn() };

  const buildModule = async (stellarConfigured: boolean) => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn().mockResolvedValue({ status: 'ok' }) },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: dbIndicator,
        },
        {
          provide: RedisHealthIndicator,
          useValue: redisIndicator,
        },
        {
          provide: StellarRpcHealthIndicator,
          useValue: {
            pingCheck: jest.fn(),
            isConfigured: stellarConfigured,
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
    healthCheck = moduleRef.get<HealthCheckService>(HealthCheckService);
    stellar = moduleRef.get<StellarRpcHealthIndicator>(StellarRpcHealthIndicator);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health/live', () => {
    it('reports the process as healthy without touching dependencies', async () => {
      await buildModule(false);
      const result = controller.live();

      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.timestamp).toBeDefined();
      expect(dbIndicator.pingCheck).not.toHaveBeenCalled();
      expect(redisIndicator.pingCheck).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('checks postgres and redis and returns the aggregate result', async () => {
      await buildModule(false);
      await controller.ready();

      expect(healthCheck.check).toHaveBeenCalledTimes(1);
      const checks = (healthCheck.check as jest.Mock).mock.calls[0][0];
      expect(checks).toHaveLength(2);
      await checks[0]();
      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('postgres', {
        timeout: 1500,
      });
      await checks[1]();
      expect(redisIndicator.pingCheck).toHaveBeenCalledWith('redis');
    });

    it('includes the stellar rpc check when the rpc endpoint is configured', async () => {
      await buildModule(true);
      await controller.ready();

      const checks = (healthCheck.check as jest.Mock).mock.calls[0][0];
      expect(checks).toHaveLength(3);
      await checks[2]();
      expect(stellar.pingCheck).toHaveBeenCalledWith('stellar-rpc');
    });

    it('omits the stellar rpc check in mock mode', async () => {
      await buildModule(false);
      await controller.ready();

      const checks = (healthCheck.check as jest.Mock).mock.calls[0][0];
      expect(checks).toHaveLength(2);
      expect(stellar.pingCheck).not.toHaveBeenCalled();
    });
  });
});
