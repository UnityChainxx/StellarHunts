import { Test, TestingModule } from '@nestjs/testing';
import { QuizController } from './controllers/quiz.controller';
import { QuizService } from './services/quiz.service';

describe('QuizController', () => {
  let controller: QuizController;
  let quizServiceMock: any;

  const mockQuiz: any = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Quiz',
    description: 'Desc',
    topic: 'Stellar',
    isActive: true,
  };

  beforeEach(async () => {
    quizServiceMock = {
      createQuiz: jest.fn().mockResolvedValue(mockQuiz),
      getQuizzes: jest.fn().mockResolvedValue([mockQuiz]),
      getQuizTopics: jest.fn().mockResolvedValue(['Stellar']),
      getQuizById: jest.fn().mockResolvedValue(mockQuiz),
      getQuizForTaking: jest.fn().mockResolvedValue(mockQuiz),
      submitQuiz: jest.fn().mockResolvedValue({ quizId: mockQuiz.id, earnedPoints: 10, passed: true }),
      updateQuizStatus: jest.fn().mockResolvedValue({ ...mockQuiz, isActive: false }),
      deleteQuiz: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizController],
      providers: [{ provide: QuizService, useValue: quizServiceMock }],
    }).compile();

    controller = module.get<QuizController>(QuizController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates quiz', async () => {
    const res = await controller.createQuiz({ title: 'Test Quiz' } as any);
    expect(res).toEqual(mockQuiz);
    expect(quizServiceMock.createQuiz).toHaveBeenCalled();
  });

  it('gets quizzes with parsed query filters', async () => {
    const res = await controller.getQuizzes('Stellar', 'true', 'true', '5');
    expect(res).toEqual([mockQuiz]);
    expect(quizServiceMock.getQuizzes).toHaveBeenCalledWith({
      topic: 'Stellar',
      isActive: true,
      randomize: true,
      limit: 5,
    });
  });

  it('gets topics', async () => {
    const res = await controller.getQuizTopics();
    expect(res).toEqual(['Stellar']);
  });

  it('gets quiz by id', async () => {
    const res = await controller.getQuizById(mockQuiz.id);
    expect(res).toEqual(mockQuiz);
  });

  it('gets quiz for taking', async () => {
    const res = await controller.getQuizForTaking(mockQuiz.id);
    expect(res).toEqual(mockQuiz);
  });

  it('submits quiz', async () => {
    const res = await controller.submitQuiz({ quizId: mockQuiz.id, answers: [], timeTaken: 10 } as any);
    expect(res.passed).toBe(true);
  });

  it('updates quiz status', async () => {
    const res = await controller.updateQuizStatus(mockQuiz.id, false);
    expect(res.isActive).toBe(false);
  });

  it('deletes quiz', async () => {
    await controller.deleteQuiz(mockQuiz.id);
    expect(quizServiceMock.deleteQuiz).toHaveBeenCalledWith(mockQuiz.id);
  });
});
