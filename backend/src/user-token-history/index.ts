// Main exports for the user token history module
export { UserTokenHistoryModule } from './user-token-history.module';
export { UserTokenHistoryService } from './services/user-token-history.service';
export { TokenHistoryController } from './controllers/token-history.controller';
export { AdminGuard } from './guards/admin.guard';
export {
  TokenHistory,
  TokenType,
  TokenStatus,
} from './entities/token-history.entity';

// Interface and DTO exports. The DTO classes live in ./dto/token-history.dto;
// re-export the interfaces explicitly so the DTO names aren't duplicated.
export {
  TokenMetadata,
  TokenHistoryResponse,
  TokenRevocationResult,
  TokenHistoryFilters,
  TokenHistoryStats,
  UserTokenSummary,
} from './interfaces/token-history.interface';
export * from './dto/token-history.dto';
