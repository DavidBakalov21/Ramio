import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
  
  
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(
      private readonly auth: AuthService,
      private readonly prisma: PrismaService,
      private readonly reflector: Reflector,
    ) {}
  
    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      // Check if route is marked as public
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      
      if (isPublic) {
        return true;
      }

      const req = ctx.switchToHttp().getRequest<Request>();
  
      const accessToken = req.cookies?.access_token;
      if (!accessToken) throw new UnauthorizedException('No access token cookie');
  

      const payload = await this.auth.verifyAccessToken(accessToken);
  
      const cognitoSub = String(payload.sub || '');
      if (!cognitoSub) throw new UnauthorizedException('Missing sub');
  
      const user = await this.prisma.user.findUnique({ where: { cognitoSub } });
      if (!user) throw new UnauthorizedException('User not found');
  
      (req as any).user = user;
      return true;
    }
  }