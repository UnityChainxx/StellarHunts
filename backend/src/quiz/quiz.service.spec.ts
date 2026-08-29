import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuizService } from './services/quiz.service';
import { Quiz } from './entities/quiz.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizOption } from './entities/quiz-option.entity';

describe('QuizService', () => {
  let service: QuizService;
  let quizRepositoryMock: any;
  let questionRepositoryMock: any;
  let optionRepositoryMock: any;

  const mockQuiz = {
    id: 'quiz-1',
    title: 'Stellar Basics',
    description: 'Learn Soroban',
    topic: 'Stellar',
    timeLimit: 60,
    passingScore: 70,
    randomizeQuestions: false,
    randomizeOptions: false,
    isActive: true,
    questions: [
      {
        id: 'q-1',
        question: 'What is Soroban?',
        points: 10,
        order: 0,
        explanation: 'Soroban is a smart contract platform',
        options: [
          { id: 'opt-1', text: 'Smart contract platform', isCorrect: true, order: 0 },
          { id: 'opt-2', text: 'Database', isCorrect: false, order: 1 },
        ],
      },
    ],
  };

  beforeEach(async () => {
    quizRepositoryMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((quiz) => Promise.resolve({ id: 'quiz-1', ...quiz })),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockQuiz]),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ topic: 'Stellar' }]),
      }),
    };

    questionRepositoryMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((q) => Promise.resolve({ id: 'q-1', ...q })),
    };

    optionRepositoryMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((o) => Promise.resolve({ id: 'opt-1', ...o })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        { provide: getRepositoryToken(QuizQuestion), useValue: questionRepositoryMock },
        { provide: getRepositoryToken(QuizOption), useValue: optionRepositoryMock },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createQuiz', () => {
    it('creates and returns a quiz successfully', async () => {
      quizRepositoryMock.findOne.mockResolvedValue(mockQuiz);

      const dto: any = {
        title: 'Stellar Basics',
        description: 'Learn Soroban',
        topic: 'Stellar',
        questions: [
          {
            question: 'What is Soroban?',
            type: 'multiple-choice',
            options: [{ text: 'Smart contract platform', isCorrect: true }],
          },
        ],
      };

      const result = await service.createQuiz(dto);
      expect(result).toBeDefined();
      expect(quizRepositoryMock.save).toHaveBeenCalled();
    });
  });

  describe('getQuizById', () => {
    it('returns quiz when found', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        ...mockQuiz,
        questions: [
          {
            ...mockQuiz.questions[0],
            options: [...mockQuiz.questions[0].options],
          },
        ],
      });

      const res = await service.getQuizById('quiz-1');
      expect(res.id).toBe('quiz-1');
    });

    it('throws NotFoundException when quiz does not exist', async () => {
      quizRepositoryMock.findOne.mockResolvedValue(null);
      await expect(service.getQuizById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQuizForTaking', () => {
    it('throws BadRequestException if quiz is inactive', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({ ...mockQuiz, isActive: false, questions: [] });
      await expect(service.getQuizForTaking('quiz-1')).rejects.toThrow(BadRequestException);
    });

    it('returns quiz for taking if active', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        ...mockQuiz,
        isActive: true,
        questions: [{ ...mockQuiz.questions[0], options: [...mockQuiz.questions[0].options] }],
      });
      const res = await service.getQuizForTaking('quiz-1');
      expect(res.id).toBe('quiz-1');
    });
  });

  describe('submitQuiz', () => {
    it('calculates result for quiz submission', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        ...mockQuiz,
        isActive: true,
        questions: [{ ...mockQuiz.questions[0], options: [...mockQuiz.questions[0].options] }],
      });

      const submission: any = {
        quizId: 'quiz-1',
        timeTaken: 30,
        answers: [{ questionId: 'q-1', selectedOptionIds: ['opt-1'] }],
      };

      const result = await service.submitQuiz(submission);
      expect(result.quizId).toBe('quiz-1');
      expect(result.earnedPoints).toBe(10);
      expect(result.passed).toBe(true);
    });
  });

  describe('updateQuizStatus & deleteQuiz', () => {
    it('updates status of quiz', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({ ...mockQuiz, questions: [] });
      const updated = await service.updateQuizStatus('quiz-1', false);
      expect(updated.isActive).toBe(false);
    });

    it('deletes quiz', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({ ...mockQuiz, questions: [] });
      await service.deleteQuiz('quiz-1');
      expect(quizRepositoryMock.remove).toHaveBeenCalled();
    });
  });
});
