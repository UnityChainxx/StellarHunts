import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';

@Injectable()
export class APIKeyGuard implements CanActivate {
  private readonly logger = new Logger(APIKeyGuard.name);

  constructor(private apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      this.logger.warn('API Key missing from headers.');
      throw new UnauthorizedException('API Key missing');
    }

    // Match against the route pattern (e.g. `/api-keys/protected`) so
    // scope checks are stable regardless of the global `/api/v1` prefix.
    const endpoint =
      (request.route?.path as string | undefined) ?? request.path;

    const isValid = this.apiKeyService.validateApiKey(apiKey, endpoint);

    if (!isValid) {
      this.logger.warn('Invalid API Key for requested endpoint.');
      throw new UnauthorizedException('Invalid API Key');
    }

    return true;
  }
}
