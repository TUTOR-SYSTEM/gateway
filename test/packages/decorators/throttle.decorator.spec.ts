import { Throttle, THROTTLE_KEY } from 'src/packages/decorators/throttle.decorator';

describe('Throttle decorator', () => {
  it('stores the limit and ttl under the throttle metadata key', () => {
    class Sample {
      @Throttle(5, 60_000)
      handler() {
        return 'ok';
      }
    }
    expect(Reflect.getMetadata(THROTTLE_KEY, Sample.prototype.handler)).toEqual({
      limit: 5,
      ttl: 60_000,
    });
  });

  it('keeps distinct metadata per decorated method', () => {
    class Sample {
      @Throttle(1, 1000)
      a() {}

      @Throttle(10, 5000)
      b() {}
    }
    expect(Reflect.getMetadata(THROTTLE_KEY, Sample.prototype.a)).toEqual({ limit: 1, ttl: 1000 });
    expect(Reflect.getMetadata(THROTTLE_KEY, Sample.prototype.b)).toEqual({ limit: 10, ttl: 5000 });
  });
});
