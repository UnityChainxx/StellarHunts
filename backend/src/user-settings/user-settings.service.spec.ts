import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { UserSettingsService } from './user-settings.service';
import {
  UserSettings,
  Language,
  Theme,
  SoundVolume,
} from './entities/user-settings.entity';
import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

describe('UserSettingsService', () => {
  let service: UserSettingsService;
  let repository: Repository<UserSettings>;
  const mockRepository: Record<string, jest.Mock> = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSettingsService,
        { provide: getRepositoryToken(UserSettings), useValue: mockRepository },
      ],
    }).compile();
    service = module.get(UserSettingsService);
    repository = module.get(getRepositoryToken(UserSettings));
  });

  afterEach(() => jest.clearAllMocks());

  it('returns existing settings', async () => {
    const settings = { userId: 'u1', language: Language.ENGLISH, theme: Theme.DARK } as UserSettings;
    mockRepository.findOne.mockResolvedValue(settings);
    await expect(service.getUserSettings('u1')).resolves.toMatchObject(settings);
  });

  it('creates default settings when missing', async () => {
    const settings = { userId: 'u1', language: Language.ENGLISH, theme: Theme.AUTO } as UserSettings;
    mockRepository.findOne.mockResolvedValue(null);
    mockRepository.create.mockReturnValue(settings);
    mockRepository.save.mockResolvedValue(settings);
    await expect(service.getUserSettings('u1')).resolves.toMatchObject(settings);
  });

  it('updates existing settings', async () => {
    const existing = { userId: 'u1', language: Language.ENGLISH, theme: Theme.LIGHT, notificationsEnabled: true } as UserSettings;
    mockRepository.findOne.mockResolvedValue(existing);
    mockRepository.save.mockImplementation(async (value) => value);
    const result = await service.updateUserSettings('u1', {
      language: Language.SPANISH,
      theme: Theme.DARK,
      notificationsEnabled: false,
    });
    expect(result.language).toBe(Language.SPANISH);
    expect(result.darkMode).toBe(true);
    expect(result.notificationsEnabled).toBe(false);
  });

  it('creates defaults before applying an update when missing', async () => {
    const defaults = { userId: 'u1', language: Language.ENGLISH, theme: Theme.AUTO } as UserSettings;
    mockRepository.findOne.mockResolvedValue(null);
    mockRepository.create.mockReturnValue(defaults);
    mockRepository.save.mockResolvedValue(defaults);
    await service.updateUserSettings('u1', { language: Language.FRENCH });
    expect(mockRepository.save).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ autoSaveInterval: 5 }],
    [{ textSize: 250 }],
    [{ notificationTypes: { invalidKey: true } }],
  ])('rejects invalid settings', async (updateDto) => {
    await expect(service.updateUserSettings('u1', updateDto as any)).rejects.toThrow(BadRequestException);
  });

  it('resets settings to defaults', async () => {
    const existing = { userId: 'u1', language: Language.SPANISH, theme: Theme.DARK, darkMode: true, masterVolume: SoundVolume.HIGH } as UserSettings;
    mockRepository.findOne.mockResolvedValue(existing);
    mockRepository.save.mockImplementation(async (value) => value);
    const result = await service.resetUserSettings('u1');
    expect(result.language).toBe(Language.ENGLISH);
    expect(result.theme).toBe(Theme.AUTO);
    expect(result.darkMode).toBe(false);
    expect(result.masterVolume).toBe(SoundVolume.MEDIUM);
  });
});
