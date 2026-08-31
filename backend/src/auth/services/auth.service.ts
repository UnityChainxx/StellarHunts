import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { RegisterDto } from '../dto/register.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UserTokenHistoryService } from '../../user-token-history/services/user-token-history.service';
import { TokenType } from '../../user-token-history/entities/token-history.entity';

const BREACHED_PASSWORDS = new Set([
  'password',
  'password123!',
  '12345678',
  'qwerty123!',
  'letmein123!',
  'welcome123!',
  'iloveyou123!',
  'admin123!',
]);

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  username?: string;
  jti?: string;
  fam?: string; // token family id (grouping one login session)
  type?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessJti: string;
  refreshJti: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenHistoryService: UserTokenHistoryService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { name, username, email, password } = registerDto;

    try {
      this.assertPasswordPolicy(password, email, username);

      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Create new user
      const user = this.userRepository.create({
        name: name.trim(),
        username: username.trim(),
        email: email.toLowerCase(),
        password, // Will be hashed by the entity hook
      });

      const savedUser = await this.userRepository.save(user);

      // Generate JWT token pair (access + refresh)
      const tokens = await this.issueTokenPair(savedUser);
      const expiresIn = this.getTokenExpirationTime();
      const refreshExpiresIn = this.getRefreshTokenExpirationTime();

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn,
        refreshExpiresIn,
        user: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
          createdAt: savedUser.createdAt,
        },
      };
    } catch (error) {
      console.error('Registration error:', error); // Add logging

      if (error instanceof ConflictException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.code === '23505') {
        // PostgreSQL unique violation
        throw new ConflictException('User with this email already exists');
      }

      throw new BadRequestException(
        `Failed to create user account: ${error.message}`,
      );
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    try {
      // Find user by email
      const user = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedException('Account has been deactivated');
      }

      // Validate password
      const isPasswordValid = await user.validatePassword(password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Update last login time
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });

      // Generate JWT token pair (access + refresh)
      const tokens = await this.issueTokenPair(user);
      const expiresIn = this.getTokenExpirationTime();
      const refreshExpiresIn = this.getRefreshTokenExpirationTime();

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn,
        refreshExpiresIn,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      console.error('Login error:', error); // Add logging

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new BadRequestException(`Login failed: ${error.message}`);
    }
  }

  async validateUser(payload: JwtPayload, rawToken?: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (rawToken) {
      const revoked = await this.tokenHistoryService.isTokenRevoked(rawToken);
      if (revoked) {
        throw new UnauthorizedException('Token has been revoked or expired');
      }
    }

    return user;
  }

  /**
   * Exchange a valid refresh token for a fresh token pair (rotation).
   * The presented refresh token is revoked so it cannot be reused.
   */
  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // ── Stolen-token / reuse detection ─────────────────────────────
    // If the presented refresh token was already rotated (its history record
    // is REVOKED/EXPIRED/USED rather than ACTIVE), it is being replayed —
    // which indicates token theft. Revoke the whole token family and every
    // remaining session for the user, then reject the request.
    const reuseRecord = await this.tokenHistoryService.findTokenReuse(
      refreshToken,
    );
    if (reuseRecord) {
      const familyId =
        reuseRecord.familyId || (payload.fam as string | undefined);

      if (familyId) {
        await this.tokenHistoryService.revokeTokenFamily(
          familyId,
          payload.sub,
          'Stolen token reuse detected',
        );
      }
      await this.tokenHistoryService.revokeAllUserTokens(
        payload.sub,
        payload.sub,
        'Stolen token reuse detected',
        TokenType.REFRESH,
      );

      throw new UnauthorizedException(
        'Refresh token has already been used. Please sign in again.',
      );
    }

    // Rotate: revoke the presented refresh token before issuing a new pair.
    await this.tokenHistoryService.revokeTokenByValue(
      refreshToken,
      payload.sub,
      'rotated',
    );

    const user = await this.getUserById(payload.sub);
    const tokens = await this.issueTokenPair(
      user,
      (payload.fam as string | undefined) || undefined,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.getTokenExpirationTime(),
      refreshExpiresIn: this.getRefreshTokenExpirationTime(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Server-side logout. Revokes the presented access token (and optionally a
   * refresh token) so they can no longer be used even before natural expiry.
   */
  async logout(
    userId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<{ success: boolean }> {
    if (accessToken) {
      await this.tokenHistoryService.revokeTokenByValue(
        accessToken,
        userId,
        'logout',
      );
    }

    if (refreshToken) {
      await this.tokenHistoryService.revokeTokenByValue(
        refreshToken,
        userId,
        'logout',
      );
    }

    return { success: true };
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async issueTokenPair(user: User, familyId?: string): Promise<TokenPair> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const accessExpiresIn = this.getTokenExpirationTime();
    const refreshExpiresIn = this.getRefreshTokenExpirationTime();

    // A fresh login starts a new token family; a refresh continues the
    // family of the (rotated) refresh token so a stolen descendant can be
    // traced back and revoked as a unit.
    const tokenFamilyId = familyId ?? crypto.randomUUID();

    const basePayload: Pick<JwtPayload, 'sub' | 'email' | 'name'> & {
      fam: string;
    } = {
      sub: user.id,
      email: user.email,
      name: user.name,
      fam: tokenFamilyId,
    };

    const accessToken = this.jwtService.sign(
      { ...basePayload, jti: accessJti, type: 'access' },
      { expiresIn: accessExpiresIn },
    );
    const refreshToken = this.jwtService.sign(
      { ...basePayload, jti: refreshJti, type: 'refresh' },
      { expiresIn: refreshExpiresIn },
    );

    await this.tokenHistoryService.recordTokenIssuance({
      userId: user.id,
      token: accessToken,
      tokenType: TokenType.ACCESS,
      jti: accessJti,
      familyId: tokenFamilyId,
    });
    await this.tokenHistoryService.recordTokenIssuance({
      userId: user.id,
      token: refreshToken,
      tokenType: TokenType.REFRESH,
      jti: refreshJti,
      familyId: tokenFamilyId,
    });

    return { accessToken, refreshToken, accessJti, refreshJti };
  }

  private getTokenExpirationTime(): number {
    const expiresIn = this.configService.get('JWT_EXPIRES_IN') || '15m';
    return this.parseExpiresInSeconds(expiresIn);
  }

  private getRefreshTokenExpirationTime(): number {
    const expiresIn =
      this.configService.get('JWT_REFRESH_EXPIRES_IN') || '30d';
    return this.parseExpiresInSeconds(expiresIn);
  }

  private parseExpiresInSeconds(expiresIn: string | number): number {
    // Convert time string to seconds
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }

    const timeValue = Number.parseInt(expiresIn);
    const timeUnit = expiresIn.slice(-1);

    switch (timeUnit) {
      case 's':
        return timeValue;
      case 'm':
        return timeValue * 60;
      case 'h':
        return timeValue * 60 * 60;
      case 'd':
        return timeValue * 24 * 60 * 60;
      default:
        return 900; // 15 minutes default
    }
  }

  private assertPasswordPolicy(
    password: string,
    email: string,
    username: string,
  ): void {
    const normalized = password.trim().toLowerCase();
    const localPart = email.split('@')[0]?.toLowerCase() ?? '';
    const userName = username.toLowerCase();

    if (BREACHED_PASSWORDS.has(normalized)) {
      throw new BadRequestException(
        'Choose a stronger password that is not widely compromised',
      );
    }

    if (
      normalized.includes(localPart) ||
      normalized.includes(userName) ||
      normalized.includes('password')
    ) {
      throw new BadRequestException(
        'Choose a password that does not contain your personal identifiers',
      );
    }
  }
}
