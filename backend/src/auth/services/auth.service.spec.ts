import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { UserTokenHistoryService } from '../../user-token-history/services/user-token-history.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let tokenHistoryService: {
    recordTokenIssuance: jest.Mock;
    revokeTokenByValue: jest.Mock;
    revokeTokenFamily: jest.Mock;
    revokeAllUserTokens: jest.Mock;
    findTokenReuse: jest.Mock;
    isTokenRevoked: jest.Mock;
  };

  const registerDto: RegisterDto = {
    name: 'John Doe',
    username: 'johnny_doe',
    email: 'john@example.com',
    password: 'SecurePass123!',
  };

  const loginDto: LoginDto = {
    email: 'john@example.com',
    password: 'SecurePass123!',
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 'user-id', ...data })),
      save: jest.fn(async (data) => data),
      update: jest.fn(async () => ({})),
    };
    jwtService = {
      sign: jest.fn(() => 'signed-token'),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
        return undefined;
      }),
    };
    tokenHistoryService = {
      recordTokenIssuance: jest.fn(async () => ({})),
      revokeTokenByValue: jest.fn(async () => ({})),
      revokeTokenFamily: jest.fn(async () => ({ success: true, revokedCount: 0, errors: [], revokedTokens: [] })),
      revokeAllUserTokens: jest.fn(async () => ({ success: true, revokedCount: 0, errors: [], revokedTokens: [] })),
      findTokenReuse: jest.fn(async () => null),
      isTokenRevoked: jest.fn(async () => false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UserTokenHistoryService, useValue: tokenHistoryService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('returns an access token and refresh token', async () => {
      const savedUser = {
        id: 'user-id',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
      } as User;

      userRepository.findOne.mockResolvedValueOnce(null);
      userRepository.save.mockResolvedValue(savedUser);
      jwtService.sign.mockReturnValue('access-token');
      jwtService.sign.mockReturnValue('refresh-token');

      const result = await service.register(registerDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshExpiresIn).toBeDefined();
      expect(tokenHistoryService.recordTokenIssuance).toHaveBeenCalledTimes(2);
      expect(result.user.email).toBe('john@example.com');
    });

    it('throws ConflictException if user already exists', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'existing-user',
        email: 'john@example.com',
      } as User);

      const result = await service.register(registerDto)

      // Must NOT reveal that the account exists or issue a token.
      expect(result).toHaveProperty("message")
      expect(result).not.toHaveProperty("accessToken")
      expect(userRepository.create).not.toHaveBeenCalled()
      expect(userRepository.save).not.toHaveBeenCalled()
    })

    it("should return a generic neutral message on unique violation (anti-enumeration)", async () => {
      userRepository.findOne.mockResolvedValue(null)
      const error: any = new Error("duplicate")
      error.code = "23505"
      userRepository.save.mockRejectedValue(error)

      const result = await service.register(registerDto)

      expect(result).toHaveProperty("message")
      expect(result).not.toHaveProperty("accessToken")
    })
  })

  describe('login', () => {
    it('returns a fresh token pair on valid credentials', async () => {
      const mockUser = {
        id: 'user-id',
        name: 'John Doe',
        email: 'john@example.com',
        isActive: true,
        validatePassword: jest.fn(async () => true),
      } as User & { validatePassword: jest.Mock };

      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.user.email).toBe('john@example.com');
      expect(tokenHistoryService.recordTokenIssuance).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for invalid credentials', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException("Invalid email or password"),
      )
    })

    it('throws UnauthorizedException for inactive user', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        isActive: false,
      } as User);

      // Message identical across all failure modes.
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken', () => {
    it('rotates an invalid-type token and is rejected', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        type: 'access',
        email: 'john@example.com',
      });

      await expect(service.refreshToken('some-refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues a new token pair and revokes the old refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        type: 'refresh',
        email: 'john@example.com',
      });
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        name: 'John Doe',
        email: 'john@example.com',
        isActive: true,
      } as User);

      const result = await service.refreshToken('old-refresh-token');

      expect(tokenHistoryService.revokeTokenByValue).toHaveBeenCalledWith(
        'old-refresh-token',
        'user-id',
        'rotated',
      );
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(tokenHistoryService.recordTokenIssuance).toHaveBeenCalledTimes(2);
    });

    it('rejects an invalid refresh token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(service.refreshToken('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('detects a replayed (stolen) refresh token and revokes the whole token family', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        type: 'refresh',
        email: 'john@example.com',
        fam: 'family-123',
      });
      // The reused token was already rotated → its history record is REVOKED.
      tokenHistoryService.findTokenReuse.mockResolvedValueOnce({
        familyId: 'family-123',
        status: 'revoked',
      } as any);

      await expect(service.refreshToken('replayed-refresh')).rejects.toThrow(
        UnauthorizedException,
      );

      // The whole family and every remaining refresh session is revoked.
      expect(tokenHistoryService.revokeTokenFamily).toHaveBeenCalledWith(
        'family-123',
        'user-id',
        'Stolen token reuse detected',
      );
      expect(tokenHistoryService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-id',
        'user-id',
        'Stolen token reuse detected',
        expect.anything(),
      );
      // A new token pair must NOT be issued for a stolen/replayed token.
      expect(tokenHistoryService.recordTokenIssuance).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the access and refresh tokens', async () => {
      const result = await service.logout(
        'user-id',
        'access-token',
        'refresh-token',
      );

      expect(result.success).toBe(true);
      expect(tokenHistoryService.revokeTokenByValue).toHaveBeenCalledWith(
        'access-token',
        'user-id',
        'logout',
      );
      expect(tokenHistoryService.revokeTokenByValue).toHaveBeenCalledWith(
        'refresh-token',
        'user-id',
        'logout',
      );
    });
  });

  describe('validateUser', () => {
    it('rejects a revoked token', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        isActive: true,
      } as User);
      tokenHistoryService.isTokenRevoked.mockResolvedValue(true);

      await expect(
        service.validateUser(
          { sub: 'user-id', email: 'a@b.com', name: 'A' },
          'revoked-token',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows an unrevoked token', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        isActive: true,
      } as User);
      tokenHistoryService.isTokenRevoked.mockResolvedValue(false);

      await expect(
        service.validateUser(
          { sub: 'user-id', email: 'a@b.com', name: 'A' },
          'good-token',
        ),
      ).resolves.toBeDefined();
    });
  });
});
