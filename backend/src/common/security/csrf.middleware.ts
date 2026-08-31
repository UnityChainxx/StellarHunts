import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken) {
      throw new ForbiddenException('CSRF token missing');
    }
    next();
  }
}
