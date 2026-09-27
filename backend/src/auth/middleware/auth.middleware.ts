import {
  Injectable,
  type NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

// Express-style middleware that inspects incoming requests for a Bearer
// JWT in the Authorization header. If present and valid, the decoded
// payload is attached to the request as `req.user` for downstream
// guards/handlers to use. If the header is missing entirely, the request
// is simply passed through unauthenticated (auth enforcement is left to
// guards further down the pipeline); if the header is present but the
// token is invalid, the request is rejected here.
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    // Only attempt verification if an Authorization header is present
    // and uses the expected "Bearer <token>" scheme.
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Strip the "Bearer " prefix (7 characters) to get the raw token.
      const token = authHeader.substring(7);

      try {
        // Verify the token's signature and expiry using the configured
        // JWT secret, returning the decoded payload on success.
        const decoded = this.jwtService.verify(token, {
          secret: this.configService.get('JWT_SECRET'),
        });

        // Attach the decoded payload to the request so later
        // guards/controllers can access the authenticated user.
        req['user'] = decoded;
      } catch (error) {
        // Signature mismatch, expired token, or malformed token all land
        // here; reject the request rather than letting it proceed silently.
        throw new UnauthorizedException('Invalid token');
      }
    }

    // Continue to the next middleware/handler in the chain.
    next();
  }
}