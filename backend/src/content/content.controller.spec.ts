import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { AdminRole } from '../admin/admin-role.enum';
import { ROLES_KEY } from '../admin/roles.decorator';

describe('ContentController', () => {
  let controller: ContentController;
  let service: ContentService;

  const mockContent = {
    id: 'test-id',
    title: 'Test Content',
    body: 'Test body content',
    topic: 'test-topic',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllByTopic: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findAllAdmin: jest.fn(),
    findOneAdmin: jest.fn(),
    updateAdmin: jest.fn(),
    removeAdmin: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        {
          provide: ContentService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ContentController>(ContentController);
    service = module.get<ContentService>(ContentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all active content when no topic is provided', async () => {
      const mockContents = [mockContent];
      mockService.findAll.mockResolvedValue(mockContents);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockContents);
    });

    it('should return content filtered by topic when topic is provided', async () => {
      const topic = 'blockchain';
      const mockContents = [mockContent];
      mockService.findAllByTopic.mockResolvedValue(mockContents);

      const result = await controller.findAll(topic);

      expect(service.findAllByTopic).toHaveBeenCalledWith(topic);
      expect(result).toEqual(mockContents);
    });
  });

  describe('findOne', () => {
    it('should return content by id', async () => {
      mockService.findOne.mockResolvedValue(mockContent);

      const result = await controller.findOne('test-id');

      expect(service.findOne).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockContent);
    });
  });

  describe('create', () => {
    it('should create new content', async () => {
      const createDto: CreateContentDto = {
        title: 'New Content',
        body: 'New body content',
        topic: 'new-topic',
      };

      mockService.create.mockResolvedValue(mockContent);

      const result = await controller.create(createDto);

      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(mockContent);
    });
  });

  describe('findAllAdmin', () => {
    it('should return all content including inactive', async () => {
      const mockContents = [mockContent];
      mockService.findAllAdmin.mockResolvedValue(mockContents);

      const result = await controller.findAllAdmin();

      expect(service.findAllAdmin).toHaveBeenCalled();
      expect(result).toEqual(mockContents);
    });
  });

  describe('findOneAdmin', () => {
    it('should return content by id including inactive', async () => {
      mockService.findOneAdmin.mockResolvedValue(mockContent);

      const result = await controller.findOneAdmin('test-id');

      expect(service.findOneAdmin).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockContent);
    });
  });

  describe('updateAdmin', () => {
    it('should update content as admin', async () => {
      const updateDto: UpdateContentDto = {
        title: 'Updated Title',
      };

      const updatedContent = { ...mockContent, ...updateDto };
      mockService.updateAdmin.mockResolvedValue(updatedContent);

      const result = await controller.updateAdmin('test-id', updateDto);

      expect(service.updateAdmin).toHaveBeenCalledWith('test-id', updateDto);
      expect(result).toEqual(updatedContent);
    });
  });

  describe('removeAdmin', () => {
    it('should remove content as admin', async () => {
      mockService.removeAdmin.mockResolvedValue(undefined);

      const result = await controller.removeAdmin('test-id');

      expect(service.removeAdmin).toHaveBeenCalledWith('test-id');
      expect(result).toBeUndefined();
    });
  });

  describe('Admin route access control', () => {
    const adminEndpoints = [
      { name: 'create', getMethod: () => controller.create },
      { name: 'findAllAdmin', getMethod: () => controller.findAllAdmin },
      { name: 'findOneAdmin', getMethod: () => controller.findOneAdmin },
      { name: 'updateAdmin', getMethod: () => controller.updateAdmin },
      { name: 'removeAdmin', getMethod: () => controller.removeAdmin },
    ];

    adminEndpoints.forEach(({ name, getMethod }) => {
      it(`${name} should require JwtAuthGuard and RolesGuard with AdminRole.ADMIN`, () => {
        const method = getMethod();
        const guards = Reflect.getMetadata(GUARDS_METADATA, method);
        expect(guards).toContain(JwtAuthGuard);
        expect(guards).toContain(RolesGuard);

        const roles = Reflect.getMetadata(ROLES_KEY, method);
        expect(roles).toEqual([AdminRole.ADMIN]);
      });
    });

    it('rejects unauthenticated requests through RolesGuard', () => {
      const reflector = new Reflector();
      const rolesGuard = new RolesGuard(reflector);

      const mockExecutionContext = {
        getHandler: () => controller.create,
        getClass: () => ContentController,
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });

    it('rejects requests from users lacking the admin role', () => {
      const reflector = new Reflector();
      const rolesGuard = new RolesGuard(reflector);

      const mockExecutionContext = {
        getHandler: () => controller.create,
        getClass: () => ContentController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'user' } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });
  });
});
