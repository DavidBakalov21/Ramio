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
  
    // Log token payload for debugging (only log first few times to avoid spam)
    // TODO: Remove or make this conditional in production
    if (Math.random() < 0.1) {
      // Only log 10% of the time
      console.log('[JwtAuthGuard] Token payload sample:', {
        sub: payload.sub,
        email: payload.email,
        username: payload.username,
        token_use: payload.token_use,
      });
    }

    // Try to find user by the token's cognitoSub
    let user = await this.prisma.user.findUnique({ where: { cognitoSub } });

    // If not found, it might be because accounts are linked
    // The token might have Google user's sub, but DB has password user's sub
    // Try to find by email as a fallback (if email is in access token)
    // Note: Access tokens from Cognito typically don't include email
    // But some configurations might include it in the username field
    if (!user) {
      // Try finding by email if available in token
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

      // If still not found, try by username (which might be email in some Cognito configs)
      if (!user && payload.username) {
        const userByUsername = await this.prisma.user.findFirst({
          where: { email: String(payload.username) },
        });
        if (userByUsername) {
          console.log(
            `[JwtAuthGuard] Token sub (${cognitoSub}) doesn't match DB cognitoSub (${userByUsername.cognitoSub}), but found user by username/email - accounts likely linked`,
          );
          user = userByUsername;
        }
      }

      // Last resort: if user not found and we don't have email in token,
      // query Cognito to get the email, then look up by email
      // This handles the case where accounts are linked and token has different sub than DB
      if (!user) {
        console.log(
          `[JwtAuthGuard] User not found for cognitoSub: ${cognitoSub}. Querying Cognito for email...`,
        );
        const email = await this.auth.getEmailFromCognitoSub(cognitoSub);
        if (email) {
          const userByEmail = await this.prisma.user.findUnique({
            where: { email },
          });
          if (userByEmail) {
            console.log(
              `[JwtAuthGuard] Found user by email (${email}) - accounts are linked. Token sub: ${cognitoSub}, DB cognitoSub: ${userByEmail.cognitoSub}`,
            );
            user = userByEmail;
          }
        }

        if (!user) {
          console.error(
            `[JwtAuthGuard] User not found for cognitoSub: ${cognitoSub} even after querying Cognito.`,
          );
        }
      }
    }

      if (!user) throw new UnauthorizedException('User not found');
  
      (req as any).user = user;
      return true;
    }
  }
