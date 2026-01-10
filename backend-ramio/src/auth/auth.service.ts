import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from 'src/prisma/prisma.service';
import { TokenResponse } from './interfaces/tokenResponse';
import {
  CognitoIdentityProviderClient,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  MessageActionType,
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

    // Initialize Cognito client for admin operations (account linking, password setting)
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.region,
      // AWS credentials will be picked up from:
      // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
      // 2. IAM role (if running on EC2/Lambda)
      // 3. AWS credentials file (~/.aws/credentials)
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

    // Check if user with this email already exists (from password signup)
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    let user;
    let finalCognitoSub = cognitoSub;

    if (existingUserByEmail && existingUserByEmail.cognitoSub !== cognitoSub) {
      // User exists with different cognitoSub - they signed up with password first
      // Check if accounts are already linked by trying to link (will fail if already linked)
      try {
        await this.linkGoogleProviderToUser(
          existingUserByEmail.cognitoSub, // Destination: password user's cognitoSub
          cognitoSub, // Source: Google user's cognitoSub
          email,
        );

      
        finalCognitoSub = existingUserByEmail.cognitoSub;

        user = await this.prisma.user.update({
          where: { email },
          data: {
            cognitoSub: finalCognitoSub, // Keep the original (password user's) cognitoSub
            profilePictureUrl: picture ?? undefined,
          },
        });

        // IMPORTANT: After linking, the current Google tokens are for the Google user's sub
        // These tokens won't validate for the linked account (password user's sub)
        // We need to exchange tokens or redirect to get new tokens for the linked account
        // For now, redirect to login again to get proper tokens
        console.log(
          '[AuthService] Accounts linked successfully - continuing with authentication',
        );
      } catch (linkError: any) {
        // Check if accounts are already linked (this is the expected case after first link)
        const linkErrorMessage = String(linkError?.message || '').toLowerCase();
        const isAlreadyLinked =
          linkError?.name === 'InvalidParameterException' &&
          (linkErrorMessage.includes('already linked') ||
            linkErrorMessage.includes('sourceuser') ||
            linkErrorMessage.includes('destinationuser'));

        if (isAlreadyLinked) {
          console.log(
            '[AuthService] Accounts are already linked - checking if token sub matches DB user',
          );

          // Accounts are already linked in Cognito
          // When linked, Cognito should return tokens for the destination user (password user's sub)
          // But the token we received might still have the Google user's sub
          // We need to check: if the token's sub matches our DB user's cognitoSub, we're good
          // If not, we need to handle it differently

          // Check if the token's cognitoSub actually matches the password user's sub
          // If accounts are linked, Cognito might return tokens with either sub
          // But for consistency, we should use the password user's cognitoSub from DB
          finalCognitoSub = existingUserByEmail.cognitoSub;

          // Update DB to ensure it uses the password user's cognitoSub
          user = await this.prisma.user.update({
            where: { email },
            data: {
              cognitoSub: finalCognitoSub,
              profilePictureUrl: picture ?? undefined,
            },
          });

          // IMPORTANT: If token's sub doesn't match finalCognitoSub, it's okay
          // The JwtAuthGuard will handle this by looking up the user by email as a fallback
          // Both Google and password login will work because accounts are linked
          if (cognitoSub !== finalCognitoSub) {
            console.log(
              `[AuthService] Token sub (${cognitoSub}) doesn't match DB cognitoSub (${finalCognitoSub}) - accounts are linked, guard will handle authentication by email`,
            );
          }
        } else {
          console.error(
            '[AuthService] Failed to link Google provider:',
            linkError,
          );
          // If linking fails for other reasons, fall back to using Google cognitoSub
          // Password login won't work, but Google login will
          user = await this.prisma.user.update({
            where: { email },
            data: {
              cognitoSub, // Use Google's cognitoSub
              profilePictureUrl: picture ?? undefined,
            },
          });
        }
      }
    } else {
      // Normal flow: upsert by cognitoSub
      user = await this.prisma.user.upsert({
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
    }

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

    // Clear access_token cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
    });

    // Clear refresh_token cookie
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

  /**
   * Get email from Cognito user by cognitoSub
   * Used when accounts are linked and token has different sub than DB
   * For federated users (Google), the Username might be formatted as "google_xxxxx"
   * but we can try using the cognitoSub directly
   */
  async getEmailFromCognitoSub(cognitoSub: string): Promise<string | null> {
    try {
      // For federated identity users (like Google), the username format might be different
      // Try using cognitoSub directly first
      const userResponse = await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: cognitoSub, // This should work for both Cognito and federated users
        }),
      );

      const emailAttr = userResponse.UserAttributes?.find(
        (attr) => attr.Name === 'email',
      );
      return emailAttr?.Value || null;
    } catch (error: any) {
      // If AdminGetUser fails, it might be because:
      // 1. User doesn't exist (shouldn't happen if token is valid)
      // 2. Username format is different for federated users
      // 3. Permission issues
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

  private calculateSecretHash(
    username: string,
    clientId: string,
  ): string | undefined {
    const clientSecret = this.config.get('COGNITO_CLIENT_SECRET');
    if (!clientSecret) {
      return undefined; // No secret hash needed if client doesn't have a secret
    }
    // SECRET_HASH = HMAC-SHA256(client_secret, username + client_id)
    return createHmac('SHA256', clientSecret)
      .update(username + clientId)
      .digest('base64');
  }

  async loginWithPassword(
    email: string,
    password: string,
    res: Response,
  ): Promise<void> {
    const clientId = this.config.get('COGNITO_CLIENT_ID');

    // Check if user exists in DB first (to detect Google signups)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    // For Google-federated users: we set password using cognitoSub as Username
    // For email/password users: we set password using email as Username
    // Query Cognito to get the actual username that was used when setting the password
    let usernameForAuth = email;
    let secretHash = this.calculateSecretHash(email, clientId);

    // If user exists in DB, query Cognito to find the actual username
    // Try both cognitoSub and email to find the user
    if (existingUser) {
      let cognitoUsername: string | undefined;
      
      // Try to get user by cognitoSub first (for Google users)
      try {
        const cognitoUserBySub = await this.cognitoClient.send(
          new AdminGetUserCommand({
            UserPoolId: this.userPoolId,
            Username: existingUser.cognitoSub,
          }),
        );
        cognitoUsername = cognitoUserBySub.Username;
        console.log(
          `[AuthService] Found Cognito user by cognitoSub. Username: ${cognitoUsername}`,
        );
      } catch (getUserBySubError: any) {
        // If not found by cognitoSub, try by email (for email/password users)
        try {
          const cognitoUserByEmail = await this.cognitoClient.send(
            new AdminGetUserCommand({
              UserPoolId: this.userPoolId,
              Username: email,
            }),
          );
          cognitoUsername = cognitoUserByEmail.Username;
          console.log(
            `[AuthService] Found Cognito user by email. Username: ${cognitoUsername}`,
          );
        } catch (getUserByEmailError: any) {
          console.log(
            `[AuthService] Could not find Cognito user by cognitoSub or email, will try login with email`,
          );
        }
      }

      // Use the Cognito username if found, otherwise default to email
      if (cognitoUsername) {
        usernameForAuth = cognitoUsername;
        secretHash = this.calculateSecretHash(cognitoUsername, clientId);
      }
    }

    try {
      // Use AWS SDK InitiateAuth with USER_PASSWORD_AUTH flow
      let authParameters: Record<string, string> = {
        USERNAME: usernameForAuth,
        PASSWORD: password,
      };

      // Add SECRET_HASH if client has a secret
      if (secretHash) {
        authParameters.SECRET_HASH = secretHash;
      }

      var authResponse = await this.cognitoClient.send(
        new AdminInitiateAuthCommand({
          UserPoolId: this.userPoolId,
          ClientId: clientId,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: authParameters,
        }),
      );

      // Check if challenge is required (e.g., NEW_PASSWORD_REQUIRED)
      if (authResponse.ChallengeName) {
        console.error(
          '[AuthService] Authentication challenge required:',
          authResponse.ChallengeName,
          JSON.stringify(authResponse.ChallengeParameters || {}, null, 2),
        );
        throw new UnauthorizedException(
          `Authentication challenge required: ${authResponse.ChallengeName}. User may need to set a new password.`,
        );
      }

      const authResult = authResponse.AuthenticationResult;
      if (!authResult) {
        console.error(
          '[AuthService] No authentication result in response. Full response:',
          JSON.stringify(
            {
              ChallengeName: authResponse.ChallengeName,
              ChallengeParameters: authResponse.ChallengeParameters,
              Session: authResponse.Session,
            },
            null,
            2,
          ),
        );
        throw new UnauthorizedException(
          'Failed to authenticate - no tokens returned. Check server logs for details.',
        );
      }

      // Extract tokens from auth result
      const accessToken = authResult.AccessToken;
      const idToken = authResult.IdToken;
      const refreshToken = authResult.RefreshToken;

      if (!accessToken || !idToken) {
        throw new UnauthorizedException(
          'Missing tokens in authentication result',
        );
      }

      // Verify ID token to get user info
      const idPayload = await this.verifyIdToken(idToken);
      const cognitoSub = String(idPayload.sub || '');
      const userEmail = String(idPayload.email || '');

      if (!cognitoSub)
        throw new UnauthorizedException('Missing sub in id_token');
      if (!userEmail)
        throw new UnauthorizedException('Missing email in id_token');

      // Upsert user (same as OAuth flow)
      await this.prisma.user.upsert({
        where: { cognitoSub },
        update: {
          email: userEmail,
        },
        create: {
          cognitoSub,
          email: userEmail,
          role: null,
          username: null,
        },
      });

      // Set cookies
      this.setAuthCookies(res, accessToken, refreshToken || undefined);
    } catch (e: any) {
      console.error('[AuthService] Password login error:', e);

      // If user exists in DB but password auth failed, they likely signed up with Google
      // and haven't set a password yet (or accounts aren't linked properly)
      if (existingUser) {
        const isAuthError =
          e?.name === 'NotAuthorizedException' ||
          e?.name === 'UserNotFoundException' ||
          e?.name === 'InvalidPasswordException';

        if (isAuthError) {
          throw new UnauthorizedException(
            'No password set. Please log in with Google first, then set a password in your account settings. You can set a password after logging in with Google.',
          );
        }
      }

      // Generic error for invalid credentials (user doesn't exist or wrong password)
      const errorMessage =
        e?.name === 'NotAuthorizedException' ||
        e?.name === 'UserNotFoundException' ||
        e?.name === 'InvalidPasswordException'
          ? 'Invalid email or password'
          : e?.message || 'Invalid email or password';
      throw new UnauthorizedException(errorMessage);
    }
  }

  async setPasswordForUser(
    cognitoSub: string,
    password: string,
  ): Promise<void> {
    try {
      await this.cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: cognitoSub,
          Password: password,
          Permanent: true, // User doesn't need to change password on next login
        }),
      );
    } catch (error: any) {
      console.error('[AuthService] Failed to set password:', error);
      throw new BadRequestException(
        error?.message ||
          'Failed to set password. User may already have a password set.',
      );
    }
  }

  private async linkGoogleProviderToUser(
    destinationCognitoSub: string,
    sourceCognitoSub: string,
    _email: string,
  ): Promise<void> {
    try {
      const googleProviderName =
        this.config.get('COGNITO_GOOGLE_PROVIDER_NAME') || 'Google';

      await this.cognitoClient.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: this.userPoolId,
          DestinationUser: {
            ProviderName: 'Cognito', // The existing password-based user
            ProviderAttributeValue: destinationCognitoSub, // The password user's cognitoSub
          },
          SourceUser: {
            ProviderName: googleProviderName, // The Google identity provider
            ProviderAttributeName: 'Cognito_Subject', // Use Cognito_Subject to reference by cognitoSub
            ProviderAttributeValue: sourceCognitoSub, // The Google user's cognitoSub
          },
        }),
      );

      console.log(
        `[AuthService] Successfully linked Google provider (${sourceCognitoSub}) to user (${destinationCognitoSub})`,
      );
    } catch (error: any) {
      // If accounts are already linked, that's okay - treat as success
      const errorMessage = String(error?.message || '').toLowerCase();
      const errorName = error?.name || '';
      const errorType = String(error?.__type || '').toLowerCase();

      // Check if this is an "already linked" error
      // Error from Cognito: InvalidParameterException with message "SourceUser is already linked to DestinationUser"
      const isInvalidParameter =
        errorName === 'InvalidParameterException' ||
        errorType === 'invalidparameterexception' ||
        errorType.includes('invalidparameter');

      const hasAlreadyLinkedMessage =
        errorMessage.includes('linked') ||
        errorMessage.includes('sourceuser') ||
        errorMessage.includes('destinationuser') ||
        errorMessage.includes('already linked');

      // If InvalidParameterException during linking, likely means "already linked"
      // When linking providers, InvalidParameterException usually means accounts are already linked
      if (isInvalidParameter) {
        console.log(
          `[AuthService] InvalidParameterException during linking ${hasAlreadyLinkedMessage ? '(already linked message detected)' : ''} - treating as already linked, continuing...`,
        );
        return; // Already linked, that's fine - just return success
      }

      // Also handle AliasExistsException (another form of "already linked" error)
      if (
        errorName === 'AliasExistsException' ||
        errorType === 'aliasexistsexception' ||
        errorType.includes('aliasexists')
      ) {
        console.log(
          '[AuthService] Accounts are already linked (AliasExists) - continuing...',
        );
        return;
      }

      console.error('[AuthService] Account linking error:', {
        name: errorName,
        type: errorType,
        message: errorMessage,
        fullError: error?.message,
      });
      // For other errors, re-throw so caller can handle
      throw error;
    }
  }

  async registerWithPassword(
    email: string,
    password: string,
    res: Response,
  ): Promise<void> {
    try {
      // Check if user already exists in our database
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new BadRequestException('User with this email already exists');
      }

      let cognitoSub: string | undefined;

      try {
        // Create user in Cognito
        // Use MessageAction.SUPPRESS to avoid sending welcome email
        // We'll set the password directly and mark user as confirmed
        // Create user WITHOUT temporary password first
        // We'll set the permanent password immediately after
        const createUserResponse = await this.cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: this.userPoolId,
            Username: email,
            UserAttributes: [
              {
                Name: 'email',
                Value: email,
              },
              {
                Name: 'email_verified',
                Value: 'true', // Mark email as verified
              },
            ],
            MessageAction: MessageActionType.SUPPRESS, // Don't send welcome email
            // Don't set TemporaryPassword - we'll set permanent password immediately
          }),
        );

        cognitoSub = createUserResponse.User?.Attributes?.find(
          (attr) => attr.Name === 'sub',
        )?.Value;

        if (!cognitoSub) {
          throw new BadRequestException('Failed to create user in Cognito');
        }

        // Immediately set the permanent password
        await this.cognitoClient.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: this.userPoolId,
            Username: email,
            Password: password,
            Permanent: true, // Password is permanent, no need to change on first login
          }),
        );
      } catch (createError: any) {
        // If user already exists in Cognito, get their info
        if (createError?.name === 'UsernameExistsException') {
          try {
            // Get existing user from Cognito
            const existingUserResponse = await this.cognitoClient.send(
              new AdminGetUserCommand({
                UserPoolId: this.userPoolId,
                Username: email,
              }),
            );

            cognitoSub = existingUserResponse.UserAttributes?.find(
              (attr) => attr.Name === 'sub',
            )?.Value;

            if (!cognitoSub) {
              throw new BadRequestException(
                'User exists but could not retrieve user identifier',
              );
            }

            // Try to set password (will fail if password is different, which is fine)
            try {
              await this.cognitoClient.send(
                new AdminSetUserPasswordCommand({
                  UserPoolId: this.userPoolId,
                  Username: email,
                  Password: password,
                  Permanent: true,
                }),
              );
            } catch (setPasswordError: any) {
              // If password setting fails, user might already have a different password
              // We'll try to login with the provided password, and if it fails, tell them to login
              console.warn(
                '[AuthService] Could not set password (user may already have one):',
                setPasswordError,
              );
            }
          } catch (getUserError: any) {
            throw new BadRequestException(
              'User with this email already exists. Please try logging in instead.',
            );
          }
        } else {
          throw createError;
        }
      }

      if (!cognitoSub) {
        throw new BadRequestException(
          'Failed to get user identifier from Cognito',
        );
      }

      // Create user in our database (or update if somehow exists)
      await this.prisma.user.upsert({
        where: { cognitoSub },
        update: {
          email, // Update email if it changed
        },
        create: {
          cognitoSub,
          email,
          role: null,
          username: null,
        },
      });

      // Now log them in automatically by getting tokens
      // Use password login to get tokens and set cookies
      await this.loginWithPassword(email, password, res);
    } catch (error: any) {
      console.error('[AuthService] Registration error:', error);

      // Handle known errors
      if (error?.name === 'UsernameExistsException') {
        throw new BadRequestException(
          'User with this email already exists. Please try logging in instead.',
        );
      }

      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }

      throw new BadRequestException(
        error?.message || 'Failed to register user. Please try again.',
      );
    }
  }
}
