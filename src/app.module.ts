import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './features/auth/auth.module';
import { UserModule } from './features/user/user.module';
import { AdminModule } from './features/admin/admin.module';
import { StudentModule } from './features/student/student.module';
import { ClassModule } from './features/class/class.module';
import { SessionModule } from './features/session/session.module';
import { ScheduleModule } from './features/schedule/schedule.module';
import { CurriculumModule } from './features/curriculum/curriculum.module';
import { ChapterModule } from './features/chapter/chapter.module';
import { LessonModule } from './features/lesson/lesson.module';
import { ExerciseModule } from './features/exercise/exercise.module';
import { TuitionModule } from './features/tuition/tuition.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { AttendanceModule } from './features/attendance/attendance.module';
import { ReportModule } from './features/report/report.module';
import { AiChatModule } from './features/ai-chat/ai-chat.module';
import { NotificationModule } from './features/notification/notification.module';
import { RedisModule } from './features/redis/redis.module';
import { UploadModule } from './features/upload/upload.module';
import { EmailModule } from './features/email/email.module';
import { LogModule } from './features/log/log.module';
import { TestScenarioModule } from './features/test-scenario/test-scenario.module';
import { JwtAuthGuard, LanguageGuard } from '@packages/guards';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RmqModule } from './features/rabbitmq/rmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RmqModule,
    UserModule,
    AdminModule,
    AuthModule,
    StudentModule,
    ClassModule,
    SessionModule,
    ScheduleModule,
    CurriculumModule,
    ChapterModule,
    LessonModule,
    ExerciseModule,
    TuitionModule,
    DashboardModule,
    AttendanceModule,
    ReportModule,
    AiChatModule,
    NotificationModule,
    RedisModule,
    UploadModule,
    EmailModule,
    LogModule,
    TestScenarioModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: LanguageGuard,
    },
  ],
})
export class AppModule {}
