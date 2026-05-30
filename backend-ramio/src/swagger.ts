import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') === 'true' ||
    (configService.get<string>('SWAGGER_ENABLED') !== 'false' &&
      nodeEnv !== 'production');

  if (!swaggerEnabled) {
    return;
  }

  const swaggerPath = configService.get<string>('SWAGGER_PATH') ?? 'swagger';

  const builder = new DocumentBuilder()
    .setTitle('Ramio API')
    .setDescription(
      'Ramio LMS backend REST API. Authenticated routes expect the `access_token` cookie set after OAuth login.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    });

  const serverUrl = configService.get<string>('SWAGGER_SERVER_URL');
  if (serverUrl) {
    builder.addServer(serverUrl);
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });
}
