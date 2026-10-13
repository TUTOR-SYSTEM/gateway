import { BadRequestException } from '@nestjs/common';
import { UploadController } from 'src/features/upload/upload.controller';
import { ERROR_MESSAGES } from 'src/data/constants';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

describe('UploadController missing file(s)', () => {
  const send = jest.fn();
  const controller = new UploadController({ send } as unknown as RmqProducer);
  const file = (name: string) =>
    ({
      originalname: name,
      mimetype: 'image/png',
      size: 3,
      buffer: Buffer.from('abc'),
    }) as Express.Multer.File;

  /** Runs fn and returns the thrown BadRequestException (fails the test if nothing is thrown). */
  const captureBadRequest = (fn: () => unknown): BadRequestException => {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      return err as BadRequestException;
    }
    throw new Error('expected BadRequestException to be thrown');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue({ ok: true });
  });

  it('upload(undefined) throws BadRequestException and does not call send', () => {
    expect(() => controller.upload(undefined as any)).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('upload(undefined) carries the UPLOAD_FILE_REQUIRED message with status 400', () => {
    const err = captureBadRequest(() => controller.upload(undefined as any));
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe(ERROR_MESSAGES.UPLOAD_FILE_REQUIRED);
    expect(err.message).toBe('UPLOAD_FILE_REQUIRED');
  });

  it.each([undefined, []])('uploadMultiple(%p) throws BadRequestException, no send', (files) => {
    expect(() => controller.uploadMultiple(files as any)).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([undefined, []])(
    'uploadMultiple(%p) carries the UPLOAD_FILES_REQUIRED message with status 400',
    (files) => {
      const err = captureBadRequest(() => controller.uploadMultiple(files as any));
      expect(err.getStatus()).toBe(400);
      expect(err.message).toBe(ERROR_MESSAGES.UPLOAD_FILES_REQUIRED);
      expect(err.message).toBe('UPLOAD_FILES_REQUIRED');
    },
  );

  it('upload with a file still sends upload.upload with base64 payload', async () => {
    await controller.upload(file('a.png'));
    expect(send).toHaveBeenCalledWith('upload.upload', {
      file: { originalname: 'a.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
    });
  });

  it('uploadMultiple with files still sends upload.uploadMultiple', async () => {
    await controller.uploadMultiple([file('a.png'), file('b.png')]);
    expect(send).toHaveBeenCalledWith('upload.uploadMultiple', {
      files: [
        { originalname: 'a.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
        { originalname: 'b.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
      ],
    });
  });
});
