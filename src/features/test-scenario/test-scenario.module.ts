import { Module } from '@nestjs/common';
import { TestScenarioController } from './test-scenario.controller';

@Module({
  controllers: [TestScenarioController],
})
export class TestScenarioModule {}
