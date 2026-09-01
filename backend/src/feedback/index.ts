// Main exports for the feedback module
export { FeedbackModule } from './feedback.module';
export { FeedbackService } from './services/feedback.service';
export { FeedbackController } from './controllers/feedback.controller';
export { AdminGuard } from './guards/admin.guard';
export { Feedback, TargetType } from './entities/feedback.entity';

// Interface and DTO exports. The DTO classes live in ./dto/feedback.dto;
// re-export the interfaces explicitly so the DTO names aren't duplicated.
export {
  FeedbackResponse,
  FeedbackStats,
  FeedbackFilters,
} from './interfaces/feedback.interface';
export * from './dto/feedback.dto';
