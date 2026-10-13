import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { UploadController } from 'src/features/upload/upload.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

function setup() {
  const send = jest.fn();
  return { send, controller: new UploadController({ send } as unknown as RmqProducer) };
}

function resMock() {
  const set = jest.fn();
  const sendFn = jest.fn();
  return { res: { set, send: sendFn } as unknown as Response, set, sendFn };
}

describe('UploadController', () => {
  it('GW-17: upload throws 400 when the file is missing', () => {
    const { controller, send } = setup();
    expect(() => controller.upload(undefined as never)).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('GW-17: uploadMultiple throws 400 for undefined or empty files', () => {
    const { controller, send } = setup();
    expect(() => controller.uploadMultiple(undefined as never)).toThrow(BadRequestException);
    expect(() => controller.uploadMultiple([])).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards a file to upload.upload', () => {
    const { controller, send } = setup();
    send.mockResolvedValue('ok');
    controller.upload({
      originalname: 'a.png',
      mimetype: 'image/png',
      buffer: Buffer.from('x'),
    } as never);
    expect(send).toHaveBeenCalledWith('upload.upload', expect.objectContaining({ file: expect.any(Object) }));
  });

  it('download rejects an empty key', async () => {
    const { controller } = setup();
    await expect(controller.download('', resMock().res)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GW-17: download sanitizes the filename in Content-Disposition', async () => {
    const { controller, send } = setup();
    send.mockResolvedValue({ buffer: Buffer.from('hi').toString('base64') });
    const { res, set, sendFn } = resMock();
    await controller.download('uploads/ev"il\r\nname.jpg', res);
    const header = set.mock.calls[0][0]['Content-Disposition'] as string;
    expect(header).toContain('filename="ev_il__name.jpg"');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).not.toContain('uploads/');
    expect(sendFn).toHaveBeenCalledWith(Buffer.from('hi'));
  });
});
