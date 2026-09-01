import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { UserSettings, Language, Theme, SoundVolume } from './entities/user-settings.entity';
import { jest } from '@jest/globals';

const repositoryMock: any = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
};

describe('UserSettingsService', () => {
  let service: UserSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSettingsService,
        { provide: getRepositoryToken(UserSettings), useValue: repositoryMock },
      ],
    }).compile();
    service = module.get(UserSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns existing settings', async () => {
    const settings: any = {
      id: 's1',
      userId: 'u1',
      language: Language.ENGLISH,
      theme: Theme.DARK,
      darkMode: true,
      notificationsEnabled: true,
      masterVolume: SoundVolume.MEDIUM,
      updatedAt: new Date(),
    };
    repositoryMock.findOne.mockResolvedValue(settings);
    await expect(service.getUserSettings('u1')).resolves.toMatchObject({
      userId: 'u1',
      language: Language.ENGLISH,
    });
  });

  it('creates defaults when settings are missing', async () => {
    const settings: any = {
      id: 's1',
      userId: 'u1',
      language: Language.ENGLISH,
      theme: Theme.AUTO,
      darkMode: false,
      notificationsEnabled: true,
      masterVolume: SoundVolume.MEDIUM,
      updatedAt: new Date(),
    };
    repositoryMock.findOne.mockResolvedValue(null);
    repositoryMock.create.mockReturnValue(settings);
    repositoryMock.save.mockResolvedValue(settings);
    await expect(service.getUserSettings('u1')).resolves.toMatchObject({
      userId: 'u1',
      theme: Theme.AUTO,
    });
  });

  it('updates existing settings and applies theme logic', async () => {
    const settings: any = {
      id: 's1',
      userId: 'u1',
      language: Language.ENGLISH,
      theme: Theme.LIGHT,
      darkMode: false,
      notificationsEnabled: true,
      updatedAt: new Date(),
    };
    repositoryMock.findOne.mockResolvedValue(settings);
    repositoryMock.save.mockImplementation(async (value: any) => value);
    const result = await service.updateUserSettings('u1', { theme: Theme.DARK } as any);
    expect(result.theme).toBe(Theme.DARK);
    expect(result.darkMode).toBe(true);
  });

  it('validates auto-save interval and text size', async () => {
    await expect(
      service.updateUserSettings('u1', { autoSaveInterval: 5 } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateUserSettings('u1', { textSize: 250 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('resets settings to defaults', async () => {
    const settings: any = {
      id: 's1',
      userId: 'u1',
      language: Language.SPANISH,
      theme: Theme.DARK,
      darkMode: true,
      notificationsEnabled: false,
      updatedAt: new Date(),
    };
    repositoryMock.findOne.mockResolvedValue(settings);
    repositoryMock.save.mockImplementation(async (value: any) => value);
    const result = await service.resetUserSettings('u1');
    expect(result.language).toBe(Language.ENGLISH);
    expect(result.theme).toBe(Theme.AUTO);
  });
});
