import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TestScenarioController } from './test-scenario.controller';

@Module({
  imports: [DiscoveryModule],
  controllers: [TestScenarioController],
})
export class TestScenarioModule {}
