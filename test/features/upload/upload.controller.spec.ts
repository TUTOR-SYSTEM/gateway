import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { IS_PUBLIC_KEY } from '@packages/decorators/public.decorator';
import { ROLES_KEY } from '@packages/decorators/roles.decorator';
import { UploadController } from 'src/features/upload/upload.controller';
import { ERROR_MESSAGES } from 'src/data/constants';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

const proto = UploadController.prototype;
const actor = { id: 'u-1', email: 'a@b.c', typ: 'access', role: 'TUTOR', sid: 's' } as never;
const file = (name: string) =>
  ({
    originalname: name,
    mimetype: 'image/png',
    size: 3,
    buffer: Buffer.from('abc'),
  }) as Express.Multer.File;

function setup() {
  const send = jest.fn().mockResolvedValue({ ok: true });
  const controller = new UploadController({ send } as unknown as RmqProducer);
  const res = { redirect: jest.fn() } as unknown as Response;
  return { send, controller, res };
}

describe('UploadController', () => {
  const reflector = new Reflector();

  it('upload and uploadMultiple are open to ADMIN, TUTOR and STUDENT only (PARENT gets 403)', () => {
    for (const h of ['upload', 'uploadMultiple'] as const) {
      expect(
        reflector.getAllAndOverride<string[]>(ROLES_KEY, [proto[h], UploadController]),
      ).toEqual(['ADMIN', 'TUTOR', 'STUDENT']);
    }
  });

  it('delete is ADMIN only; every handler requires authentication', () => {
    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [proto.delete, UploadController]),
    ).toEqual(['ADMIN']);
    for (const h of ['upload', 'uploadMultiple', 'download', 'delete'] as const) {
      expect(reflector.getAllAndOverride(IS_PUBLIC_KEY, [proto[h], UploadController])).toBeFalsy();
    }
  });

  it('upload with no file is a 400 and never reaches the service', () => {
    const { controller, send } = setup();
    expect(() => controller.upload(undefined as never, actor)).toThrow(BadRequestException);
    expect(() => controller.upload(undefined as never, actor)).toThrow(
      new BadRequestException(ERROR_MESSAGES.UPLOAD_FILE_REQUIRED).message,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('uploadMultiple with no files is a 400 and never reaches the service', () => {
    const { controller, send } = setup();
    expect(() => controller.uploadMultiple(undefined as never, actor)).toThrow(BadRequestException);
    expect(() => controller.uploadMultiple([], actor)).toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('upload forwards the file with the verified userId and role', async () => {
    const { controller, send } = setup();
    await controller.upload(file('a.png'), actor);
    expect(send).toHaveBeenCalledWith('upload.upload', {
      userId: 'u-1',
      role: 'TUTOR',
      file: { originalname: 'a.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
    });
  });

  it('uploadMultiple forwards files with userId and role', async () => {
    const { controller, send } = setup();
    await controller.uploadMultiple([file('a.png'), file('b.png')], actor);
    expect(send).toHaveBeenCalledWith('upload.uploadMultiple', {
      userId: 'u-1',
      role: 'TUTOR',
      files: [
        { originalname: 'a.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
        { originalname: 'b.png', mimetype: 'image/png', size: 3, buffer: 'YWJj' },
      ],
    });
  });

  it('download rejects keys outside uploads/ with 400 and never calls the service', async () => {
    const { controller, send, res } = setup();
    for (const key of [
      '',
      '../etc/passwd',
      'other/abc.jpg',
      'uploads/../secret',
      '/uploads/a.jpg',
    ]) {
      await expect(controller.download(key, actor, res)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('download asks third-service with userId/role and redirects to the presigned URL', async () => {
    const { controller, send, res } = setup();
    send.mockResolvedValue({
      url: 'https://r2.example/presigned',
      expiresIn: 300,
      contentType: 'application/pdf',
      filename: 'a.pdf',
    });
    await controller.download('uploads/abc.pdf', actor, res);
    expect(send).toHaveBeenCalledWith('upload.download', {
      key: 'uploads/abc.pdf',
      userId: 'u-1',
      role: 'TUTOR',
    });
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://r2.example/presigned');
  });

  it('delete forwards key and role (ownership is not needed for ADMIN)', async () => {
    const { controller, send } = setup();
    await controller.delete('uploads/abc.pdf', { role: 'ADMIN' } as never);
    expect(send).toHaveBeenCalledWith('upload.delete', { key: 'uploads/abc.pdf', role: 'ADMIN' });
  });
});
