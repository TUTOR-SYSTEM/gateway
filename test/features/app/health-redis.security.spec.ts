import { Logger } from '@nestjs/common';
import { AppController } from 'src/app.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

describe('F-02 gateway health/redis', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not request fetchData and does not log the raw response', async () => {
    const rmq = { send: jest.fn().mockResolvedValue({ stats: 'RAW-SECRET-VALUE' }) };
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void lines.push(String(m)));
    const controller = new AppController({ getHello: jest.fn() } as any, rmq as unknown as RmqProducer);

    await controller.checkRedisConnection();

    const [pattern, payload] = rmq.send.mock.calls[0];
    expect(pattern).toBe('health.redis');
    expect((payload as { fetchData?: boolean } | undefined)?.fetchData).not.toBe(true);
    expect(lines.join('\n')).not.toContain('RAW-SECRET-VALUE');
  });
});
