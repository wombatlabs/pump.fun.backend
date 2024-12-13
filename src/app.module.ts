import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config';
import { typeormConfig } from './config/typeorm';
import {ThrottlerGuard, ThrottlerModule} from "@nestjs/throttler";
import {APP_GUARD, APP_INTERCEPTOR} from "@nestjs/core";
import {ScheduleModule} from "@nestjs/schedule";
import { UserService } from './user/user.service';
import { GcloudService } from './gcloud/gcloud.service';
import { IndexerService } from './indexer/indexer.service';
import { UserController } from './user/user.controller';
import {JwtModule} from "@nestjs/jwt";
import config from './config/index'
import {CacheModule, CacheInterceptor} from "@nestjs/cache-manager";
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    JwtModule.registerAsync({
      useFactory: async () => {
        return {
          global: true,
          privateKey: config().JWT_PRIVATE_KEY,
          publicKey: config().JWT_PUBLIC_KEY,
          signOptions: {
            algorithm: 'RS256'
          },
          verifyOptions: {
            algorithms: ['RS256']
          }
        }
      }
    }),
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
  controllers: [AppController, UserController, AdminController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    UserService,
    GcloudService,
    IndexerService,
    AdminService
  ],
})
export class AppModule {}
