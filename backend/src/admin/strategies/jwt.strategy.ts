import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from '../admin.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private adminService: AdminService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // No fallback secret: fail fast when JWT_SECRET is not configured.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Admin login tokens carry { sub, role }. Look the admin up by id first
    // (email is a fallback for tokens minted by older login flows).
    const admin = payload.sub
      ? await this.adminService.findById(payload.sub)
      : await this.adminService.findByEmail(payload.email);
    if (!admin) {
      return null;
    }
    return { ...admin, role: payload.role };
  }
}
