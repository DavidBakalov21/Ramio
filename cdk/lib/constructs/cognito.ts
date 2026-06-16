import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoProps {
  readonly frontendUrl: string;
  readonly backendCallbackUrl: string;
  readonly googleClientId?: string;
  readonly googleClientSecret?: string;
}

export class RamioCognito extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'ramio-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
        profilePicture: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const supportedProviders = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];

    if (props.googleClientId && props.googleClientSecret) {
      const googleProvider =
        new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
          userPool: this.userPool,
          clientId: props.googleClientId,
          clientSecretValue: cdk.SecretValue.unsafePlainText(
            props.googleClientSecret,
          ),
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            fullname: cognito.ProviderAttribute.GOOGLE_NAME,
            profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
          },
        });
      this.userPool.registerIdentityProvider(googleProvider);
      supportedProviders.push(
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      );
    }

    this.userPoolClient = new cognito.UserPoolClient(this, 'AppClient', {
      userPool: this.userPool,
      userPoolClientName: 'ramio-backend',
      generateSecret: true,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [props.backendCallbackUrl],
        logoutUrls: [props.frontendUrl],
      },
      supportedIdentityProviders: supportedProviders,
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    this.userPoolDomain = new cognito.UserPoolDomain(this, 'Domain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: 'ramio-auth',
      },
    });
  }
}
