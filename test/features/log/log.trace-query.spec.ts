import { UnprocessableEntityException } from '@nestjs/common';
import { LogController } from 'src/features/log/log.controller';
import { traceLogsQuerySchema } from '@packages/entities/log';
import { ZodValidationPipe } from '@packages/pipes';

describe('GET /logs/trace/:correlationId limit', () => {
  const CORRELATION_ID = 'corr-1';
  let rmqProducer: { send: jest.Mock };
  let controller: LogController;

  beforeEach(() => {
    rmqProducer = { send: jest.fn().mockResolvedValue([]) };
    controller = new LogController(rmqProducer as never);
  });

  const pipe = new ZodValidationPipe(traceLogsQuerySchema);

  it('defaults the limit to 500 when no query is sent', () => {
    expect(pipe.transform({})).toEqual({ limit: 500 });
  });

  it('coerces a numeric string limit', () => {
    expect(pipe.transform({ limit: '250' })).toEqual({ limit: 250 });
  });

  it('rejects a limit above 1000 or below 1', () => {
    expect(() => pipe.transform({ limit: '1001' })).toThrow(UnprocessableEntityException);
    expect(() => pipe.transform({ limit: '0' })).toThrow(UnprocessableEntityException);
  });

  it('forwards the validated limit to log.trace', async () => {
    await controller.trace(CORRELATION_ID, { limit: 1000 });

    expect(rmqProducer.send).toHaveBeenCalledWith('log.trace', {
      correlationId: CORRELATION_ID,
      limit: 1000,
    });
  });
});
