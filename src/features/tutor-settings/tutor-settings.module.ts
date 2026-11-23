import { Module } from '@nestjs/common';
import { TutorSettingsController } from './tutor-settings.controller';

@Module({
  controllers: [TutorSettingsController],
})
export class TutorSettingsModule {}
