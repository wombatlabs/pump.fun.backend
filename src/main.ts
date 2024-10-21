import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());

  const configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle(configService.get('name'))
    .setDescription('Pump Fun Indexer')
    .setVersion(configService.get('version'))
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // app.enableCors({
  //   allowedHeaders: ['content-type'],
  //   origin: 'http://localhost:3000',
  //   credentials: true,
  // });

  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    credentials: true,
  });

  await app.listen(configService.get('port'));

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}

bootstrap().catch((error) => {
  console.error('App bootstrap failed:', error);
  process.exit(1)
});
