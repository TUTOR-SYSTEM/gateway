import { Module } from '@nestjs/common';
import { ApiRoutesController } from './api-routes.controller';
import { ApiRoutesService } from './api-routes.service';

@Module({
  controllers: [ApiRoutesController],
  providers: [ApiRoutesService],
})
export class ApiRoutesModule {}
