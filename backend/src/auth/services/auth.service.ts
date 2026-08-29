import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common"
import { Repository } from "typeorm"
import { JwtService } from "@nestjs/jwt"
import { ConfigService } from "@nestjs/config"
import { User } from "../entities/user.entity"
import { RegisterDto } from "../dto/register.dto"
import { AuthResponseDto } from "../dto/auth-response.dto"
import { GenericAuthMessageDto } from "../dto/generic-auth-message.dto"
import { LoginDto } from "../dto/login.dto"
import { InjectRepository } from "@nestjs/typeorm"

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  username?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registers a new user.
   *
   * Anti-enumeration: whether or not the account already exists we return a
   * generic, account-existence-neutral success response instead of a
   * distinctive "already exists" error, so attackers cannot probe whether a
   * given email is registered (OWASP A01 — account enumeration).
   *
   * A real (fresh) registration still returns the authenticated session
   * (AuthResponseDto); a duplicate email returns the same neutral HTTP
   * success status without issuing a token.
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto | GenericAuthMessageDto> {
    const { name, username, email, password } = registerDto

    try {
      this.assertPasswordPolicy(password, email, username);

      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return this.genericRegistrationMessage()
      }

      // Create new user
      const user = this.userRepository.create({
        name: name.trim(),
        username: username.trim(),
        email: email.toLowerCase(),
        password, // Will be hashed by the entity hook
      });

      const savedUser = await this.userRepository.save(user);

      // Generate JWT token
      const payload: JwtPayload = {
        sub: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
      };

      const accessToken = this.jwtService.sign(payload);
      const expiresIn = this.getTokenExpirationTime();

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
        user: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
          createdAt: savedUser.createdAt,
        },
      };
    } catch (error) {
      console.error('Registration error:', error); // Add logging

      if (error.code === "23505") {
        // PostgreSQL unique violation (email/username collision). Same
        // neutral response so attackers cannot infer which identifier is
        // already taken.
        return this.genericRegistrationMessage()
      }

      throw new BadRequestException("Registration could not be completed")
    }
  }

  /**
   * Authenticates a user.
   *
   * Anti-enumeration: every failure path (unknown email, deactivated account,
   * wrong password) returns the same generic `UnauthorizedException`, so an
   * attacker cannot infer whether an account exists or its status from the
   * login response.
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    try {
      // Find user by email
      const user = await this.userRepository.findOne({
        where: { email: email.toLowerCase() },
      });

      // Check password. Nobody exists OR account deactivated OR wrong
      // password all surface the exact same generic message & status.
      const isPasswordValid = user ? await user.validatePassword(password) : false
      if (!user || !user.isActive || !isPasswordValid) {
        throw new UnauthorizedException("Invalid email or password")
      }

      // Update last login time
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });

      // Generate JWT token
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        name: user.name,
      };

      const accessToken = this.jwtService.sign(payload);
      const expiresIn = this.getTokenExpirationTime();

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn,
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

      throw new BadRequestException("Login failed")
    }
  }

  async validateUser(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
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

  /**
   * Returns a neutral, account-existence-neutral registration response.
   * Mirrors the JS static message constant so tests can assert against it.
   */
  private genericRegistrationMessage(): GenericAuthMessageDto {
    return {
      message: "Registration successful. If an account already exists, please log in.",
    }
  }

  private getTokenExpirationTime(): number {
    const expiresIn = this.configService.get('JWT_EXPIRES_IN') || '15m';

    // Convert time string to seconds
    if (typeof expiresIn === 'string') {
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

    return typeof expiresIn === 'number' ? expiresIn : 900;
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
