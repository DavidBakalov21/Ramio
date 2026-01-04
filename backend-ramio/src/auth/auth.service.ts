import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from 'src/prisma/prisma.service';
import { TokenResponse } from './interfaces/tokenResponse';

@Injectable()
export class AuthService {
    private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
    private readonly issuer: string;
    constructor(
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
      ) {
       
        const region = this.config.get('COGNITO_REGION');
        const poolId = this.config.get('COGNITO_USER_POOL_ID');
    
        this.issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
        this.jwks = createRemoteJWKSet(
          new URL(`${this.issuer}/.well-known/jwks.json`),
        );
      }
      buildAuthorizeUrl(opts: { identityProvider?: 'Google' }) {
        const domain = this.config.get('COGNITO_DOMAIN');
        const clientId = this.config.get('COGNITO_CLIENT_ID');
        const redirectUri = this.config.get('BACKEND_CALLBACK_URL');
    
        const base =
          `${domain}/oauth2/authorize` +
          `?client_id=${encodeURIComponent(clientId)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent('openid email profile')}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
        if (opts.identityProvider) {
          return base + `&identity_provider=${encodeURIComponent(opts.identityProvider)}`;
        }
        return base;
      }
    
      async handleCallback(code: string, res: Response): Promise<string> {
        const tokens = await this.exchangeCodeForTokens(code);
    
        // Verify ID token (signature + issuer + audience)
        const idPayload = await this.verifyIdToken(tokens.id_token);
    
        const cognitoSub = String(idPayload.sub || '');
        const email = String(idPayload.email || '');
        const picture = typeof idPayload.picture === 'string' ? idPayload.picture : null;
    
        if (!cognitoSub) throw new UnauthorizedException('Missing sub in id_token');
        if (!email) throw new UnauthorizedException('Missing email in id_token');
    
        // Upsert user by cognitoSub (best stable key)
        const user = await this.prisma.user.upsert({
          where: { cognitoSub },
          update: {
            email,
            profilePictureUrl: picture ?? undefined,
          },
          create: {
            cognitoSub,
            email,
            profilePictureUrl: picture ?? undefined,
            role: null,
            username: null,
          },
        });
    
        // Set cookies (HttpOnly)
        // If refresh_token is missing, still set access cookie; but usually you want refresh too.
        this.setAuthCookies(res, tokens.access_token, tokens.refresh_token);
    
        const needsOnboarding = !user.role || !user.username;
        const frontend = this.config.get('FRONTEND_URL');
    
        return needsOnboarding ? `${frontend}/onboarding` : `${frontend}/`;
      }
    
      private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
        const domain = this.config.get('COGNITO_DOMAIN');
        const clientId = this.config.get('COGNITO_CLIENT_ID');
        const clientSecret = this.config.get('COGNITO_CLIENT_SECRET');
        const redirectUri = this.config.get('BACKEND_CALLBACK_URL');
    
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
        });
    
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
        try {
          const resp = await axios.post(`${domain}/oauth2/token`, body.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${basic}`,
            },
          });
          return resp.data as TokenResponse;
        } catch (e: any) {
          throw new BadRequestException(
            e?.response?.data ?? 'Failed to exchange code for tokens',
          );
        }
      }
    
      private async verifyIdToken(idToken: string) {
        const clientId = this.config.get('COGNITO_CLIENT_ID');
    
        const { payload } = await jwtVerify(idToken, this.jwks, {
          issuer: this.issuer,
          audience: clientId,
        });
    
      
        if (payload.token_use !== 'id') {
          throw new UnauthorizedException('token_use is not id');
        }
    
        return payload as any;
      }
    
      private setAuthCookies(res: Response, accessToken: string, refreshToken?: string) {
        const secure = this.config.get('COOKIE_SECURE') === 'true';
        const sameSiteRaw = (this.config.get('COOKIE_SAMESITE') || 'Lax') as string;
        const sameSite =
          sameSiteRaw.toLowerCase() === 'none'
            ? 'none'
            : sameSiteRaw.toLowerCase() === 'strict'
              ? 'strict'
              : 'lax';
    
        const domain = (this.config.get('COOKIE_DOMAIN') || '').trim() || undefined;
    
        res.cookie('access_token', accessToken, {
          httpOnly: true,
          secure,
          sameSite,
          domain,
          path: '/',
          maxAge: 15 * 60 * 1000, // 15 min
        });
    
        if (refreshToken) {
          res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure,
            sameSite,
            domain,
            path: '/',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          });
        }
      }
      async verifyAccessToken(accessToken: string) {
        const clientId = this.config.get('COGNITO_CLIENT_ID');
      
        const { payload } = await jwtVerify(accessToken, this.jwks, {
          issuer: this.issuer,
        });
      
        // Access token check
        if (payload.token_use !== 'access') {
          throw new UnauthorizedException('token_use is not access');
        }
      
        // Cognito access tokens commonly use client_id instead of aud
        if (payload.client_id !== clientId) {
          throw new UnauthorizedException('Wrong client_id');
        }
      
        return payload as any;
      }
}
