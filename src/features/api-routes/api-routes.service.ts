import { Injectable } from '@nestjs/common';
import type { ApiCatalogQueryDto } from '@packages/entities/api-routes';
import { RmqProducer } from '../rabbitmq/rmq.producer';
import {
  groupCatalogByFeature,
  groupCatalogByModule,
  type ApiCatalogSnapshot,
} from './api-routes.grouping';

@Injectable()
export class ApiRoutesService {
  constructor(private readonly rmqProducer: RmqProducer) {}

  async getCatalogService(query: ApiCatalogQueryDto) {
    const catalog = await this.rmqProducer.send<ApiCatalogSnapshot | null, Record<string, never>>(
      'apiRoutes.getCatalog',
      {},
    );
    if (!catalog || !query.view) return catalog;
    return query.view === 'feature'
      ? groupCatalogByFeature(catalog)
      : groupCatalogByModule(catalog);
  }

  getResultsService(userId: string) {
    return this.rmqProducer.send('apiRoutes.getResults', { userId });
  }

  saveResultService(userId: string, routeId: string, data: unknown) {
    return this.rmqProducer.send('apiRoutes.saveResult', { userId, routeId, data });
  }
}
