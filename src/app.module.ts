import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config';
import { typeormConfig } from './config/typeorm';
import {ThrottlerGuard, ThrottlerModule} from "@nestjs/throttler";
import {APP_GUARD} from "@nestjs/core";
import {ScheduleModule} from "@nestjs/schedule";
import { UserService } from './user/user.service';
import { GcloudService } from './gcloud/gcloud.service';
import { IndexerService } from './indexer/indexer.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [typeormConfig, configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        configService.get('typeorm'),
    }),
    ThrottlerModule.forRoot([{
      ttl: configuration().RATE_LIMITER_TTL,
      limit: configuration().RATE_LIMITER_LIMIT,
    }]),
    PrometheusModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    UserService,
    GcloudService,
    IndexerService
  ],
})
export class AppModule {}
