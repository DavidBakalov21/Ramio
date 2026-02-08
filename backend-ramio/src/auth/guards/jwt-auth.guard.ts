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
  
  
    if (Math.random() < 0.1) {
     
      console.log('[JwtAuthGuard] Token payload sample:', {
        sub: payload.sub,
        email: payload.email,
        username: payload.username,
        token_use: payload.token_use,
      });
    }

   
    let user = await this.prisma.user.findUnique({ where: { cognitoSub } });

 
    if (!user) {
      if (payload.email) {
        const userByEmail = await this.prisma.user.findUnique({
          where: { email: String(payload.email) },
        });
        if (userByEmail) {
          console.log(
            `[JwtAuthGuard] Token sub (${cognitoSub}) doesn't match DB cognitoSub (${userByEmail.cognitoSub}), but found user by email - accounts likely linked`,
          );
          user = userByEmail;
        }
      }

      if (!user) {
        const email = await this.auth.getEmailFromCognito(
          cognitoSub,
          payload.username,
        );
        if (email) {
          const userByEmail = await this.prisma.user.findUnique({
            where: { email },
          });
          if (userByEmail) {
            console.log(
              `[JwtAuthGuard] Found user by email (${email}) from Cognito. Token sub: ${cognitoSub}, DB cognitoSub: ${userByEmail.cognitoSub}`,
            );
            user = userByEmail;
          }
        }
        if (!user) {
          console.error(
            `[JwtAuthGuard] User not found for cognitoSub: ${cognitoSub} (tried Cognito with sub and username: ${payload.username ?? 'n/a'}).`,
          );
        }
      }
    }

      if (!user) throw new UnauthorizedException('User not found');
  
      (req as any).user = user;
      return true;
    }
  }
