import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import { JwtService } from "@nestjs/jwt"
import { ConfigService } from "@nestjs/config"
import { UnauthorizedException } from "@nestjs/common"
import { AuthService } from "./auth.service"
import { User } from "../entities/user.entity"
import type { RegisterDto } from "../dto/register.dto"
import type { LoginDto } from "../dto/login.dto"
import type { AuthResponseDto } from "../dto/auth-response.dto"
import { jest } from "@jest/globals"
import type { Repository } from "typeorm"

describe("AuthService", () => {
  let service: AuthService
  let userRepository: jest.Mocked<Repository<User>>
  let jwtService: jest.Mocked<JwtService>

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Partial<Repository<User>>>;

  const mockJwtService = {
    sign: jest.fn(),
  } as unknown as jest.Mocked<JwtService>;

  const mockConfigService = {
    get: jest.fn(),
  } as unknown as jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService)
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>
    jwtService = module.get(JwtService) as unknown as jest.Mocked<JwtService>
  })

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      name: "John Doe",
      username: "john_doe",
      email: "john@example.com",
      password: "SecurePass123!",
    }

    const registeredUser = {
      id: "user-id",
      name: "John Doe",
      email: "john@example.com",
      createdAt: new Date(),
    } as User

    it("should successfully register a new user", async () => {
      userRepository.findOne.mockResolvedValue(null)
      userRepository.create.mockReturnValue(registeredUser)
      userRepository.save.mockResolvedValue(registeredUser)
      jwtService.sign.mockReturnValue("jwt-token")
      mockConfigService.get.mockReturnValue("15m")

      const result = (await service.register(registerDto)) as AuthResponseDto

      expect(result).toHaveProperty('accessToken', 'jwt-token');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('john@example.com');
    });

    it("should return a generic neutral message if user already exists (anti-enumeration)", async () => {
      const existingUser = { id: "existing-user" } as User
      userRepository.findOne.mockResolvedValue(existingUser)

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
    const loginDto: LoginDto = {
      email: 'john@example.com',
      password: 'SecurePass123!',
    };

    const validatedUser = (isActive: boolean, passwordMatches: boolean) => {
      const user = {
        id: "user-id",
        name: "John Doe",
        email: "john@example.com",
        isActive,
        validatePassword: async () => passwordMatches,
      } as unknown as User
      return user
    }

    it("should successfully login with valid credentials", async () => {
      const mockUser = validatedUser(true, true)
      userRepository.findOne.mockResolvedValue(mockUser)
      userRepository.update.mockResolvedValue({ affected: 1, generatedMaps: [], raw: {} })
      jwtService.sign.mockReturnValue("jwt-token")
      mockConfigService.get.mockReturnValue("15m")

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken', 'jwt-token');
      expect(result).toHaveProperty('user');
    });

    it("should throw UnauthorizedException for unknown email without revealing that the account does not exist", async () => {
      userRepository.findOne.mockResolvedValue(null)

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException("Invalid email or password"),
      )
    })

    it("should throw UnauthorizedException for inactive user without revealing account status", async () => {
      const mockUser = validatedUser(false, true)
      userRepository.findOne.mockResolvedValue(mockUser)

      // Same generic message as for unknown email / wrong password.
      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException("Invalid email or password"),
      )
    })

    it("should not reveal whether an account exists when password is wrong", async () => {
      const mockUser = validatedUser(true, false)
      userRepository.findOne.mockResolvedValue(mockUser)

      // Message identical across all failure modes.
      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException("Invalid email or password"),
      )
    })
  })
})
