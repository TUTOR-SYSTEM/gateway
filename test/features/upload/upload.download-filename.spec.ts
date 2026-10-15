import type { Response } from 'express';
import { UploadController } from 'src/features/upload/upload.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

// GW-13: Vietnamese filenames must not crash Content-Disposition (Node rejects chars > 0xFF).

function setup(filename: string) {
  const send = jest.fn().mockResolvedValue({
    buffer: Buffer.from('hi').toString('base64'),
    filename,
  });
  return { send, controller: new UploadController({ send } as unknown as RmqProducer) };
}

// `set` behaves like Node: throws ERR_INVALID_CHAR for header values with chars > 0xFF.
function strictRes() {
  const headers: Record<string, string> = {};
  const set = jest.fn((fields: Record<string, string>) => {
    for (const [name, value] of Object.entries(fields)) {
      if (/[^\u0000-ÿ]/.test(String(value))) {
        const err = new TypeError(`Invalid character in header content ["${name}"]`);
        (err as NodeJS.ErrnoException).code = 'ERR_INVALID_CHAR';
        throw err;
      }
      headers[name] = String(value);
    }
  });
  const sendFn = jest.fn();
  return { res: { set, send: sendFn } as unknown as Response, headers, sendFn };
}

const VI_NAME = 'Bài giảng.pdf';

describe('UploadController.download filename encoding (GW-13)', () => {
  it('(a) does not throw for a Vietnamese filename', async () => {
    const { controller } = setup(VI_NAME);
    const { res, sendFn } = strictRes();
    await expect(controller.download('uploads/abc.pdf', res)).resolves.toBeUndefined();
    expect(sendFn).toHaveBeenCalledWith(Buffer.from('hi'));
  });

  it('(b) Content-Disposition passed to set has no char > 0xFF', async () => {
    const { controller } = setup(VI_NAME);
    const { res, headers } = strictRes();
    await controller.download('uploads/abc.pdf', res);
    expect(headers['Content-Disposition']).toBeDefined();
    expect(headers['Content-Disposition']).not.toMatch(/[^\u0000-ÿ]/);
  });

  it("(c) Content-Disposition carries filename*=UTF-8'' with the percent-encoded name", async () => {
    const { controller } = setup(VI_NAME);
    const { res, headers } = strictRes();
    await controller.download('uploads/abc.pdf', res);
    const header = headers['Content-Disposition'];
    expect(header).toContain("UTF-8''");
    expect(header).toContain(encodeURIComponent(VI_NAME));
  });

  it('(d) plain ASCII filename keeps filename="report.pdf"', async () => {
    const { controller } = setup('report.pdf');
    const { res, headers } = strictRes();
    await controller.download('uploads/abc.pdf', res);
    expect(headers['Content-Disposition']).toContain('filename="report.pdf"');
  });
});
