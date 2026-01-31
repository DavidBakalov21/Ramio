import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from 'src/prisma/prisma.service';
import { TokenResponse } from './interfaces/tokenResponse';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

@Injectable()
export class AuthService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly userPoolId: string;
  private readonly region: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.region = this.config.get('COGNITO_REGION') || 'us-east-1';
    this.userPoolId = this.config.get('COGNITO_USER_POOL_ID') || '';

    this.issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );

   
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.region,

    });
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
      return (
        base + `&identity_provider=${encodeURIComponent(opts.identityProvider)}`
      );
    }
    return base;
  }

  async handleCallback(code: string, res: Response): Promise<string> {
    const tokens = await this.exchangeCodeForTokens(code);

    const idPayload = await this.verifyIdToken(tokens.id_token);

    const cognitoSub = String(idPayload.sub || '');
    const email = String(idPayload.email || '');
    const picture =
      typeof idPayload.picture === 'string' ? idPayload.picture : null;

    if (!cognitoSub) throw new UnauthorizedException('Missing sub in id_token');
    if (!email) throw new UnauthorizedException('Missing email in id_token');

    
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

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken?: string,
  ) {
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
      maxAge: 15 * 60 * 1000, 
    });

    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure,
        sameSite,
        domain,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, 
      });
    }
  }

  clearAuthCookies(res: Response): void {
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    const sameSiteRaw = (this.config.get('COOKIE_SAMESITE') || 'Lax') as string;
    const sameSite =
      sameSiteRaw.toLowerCase() === 'none'
        ? 'none'
        : sameSiteRaw.toLowerCase() === 'strict'
          ? 'strict'
          : 'lax';

    const domain = (this.config.get('COOKIE_DOMAIN') || '').trim() || undefined;

  
    res.clearCookie('access_token', {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
    });

  
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
    });
  }
  async verifyAccessToken(accessToken: string) {
    const clientId = this.config.get('COGNITO_CLIENT_ID');

    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: this.issuer,
      });

      if (payload.token_use !== 'access') {
        throw new UnauthorizedException('token_use is not access');
      }

      if (payload.client_id !== clientId) {
        throw new UnauthorizedException('Wrong client_id');
      }

      return payload as any;
    } catch (error: any) {
      if (
        error?.code === 'ERR_JWT_EXPIRED' ||
        error?.code === 'ERR_JWT_INVALID'
      ) {
        throw new UnauthorizedException('Token expired or invalid');
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid token');
    }
  }

  async getEmailFromCognitoSub(cognitoSub: string): Promise<string | null> {
    try {
    
      const userResponse = await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: cognitoSub, 
        }),
      );

      const emailAttr = userResponse.UserAttributes?.find(
        (attr) => attr.Name === 'email',
      );
      return emailAttr?.Value || null;
    } catch (error: any) {
      console.error(
        `[AuthService] Failed to get email from Cognito for sub ${cognitoSub}:`,
        error?.name || 'Unknown error',
        error?.message || '',
      );
      return null;
    }
  }

  async refreshTokens(req: Request, res: Response): Promise<void> {
    const refreshToken = (req as any).cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token cookie');
    }

    if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const newTokens = await this.exchangeRefreshTokenForTokens(refreshToken);

    this.setAuthCookies(res, newTokens.access_token, newTokens.refresh_token);
  }

  private async exchangeRefreshTokenForTokens(
    refreshToken: string,
  ): Promise<TokenResponse> {
    const domain = this.config.get('COGNITO_DOMAIN');
    const clientId = this.config.get('COGNITO_CLIENT_ID');
    const clientSecret = this.config.get('COGNITO_CLIENT_SECRET');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
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
      const errorMessage =
        e?.response?.data?.error_description ||
        e?.response?.data?.error ||
        'Failed to refresh tokens';

      console.error(
        '[AuthService] Refresh token exchange failed:',
        errorMessage,
      );

      throw new UnauthorizedException(errorMessage);
    }
  }

}
