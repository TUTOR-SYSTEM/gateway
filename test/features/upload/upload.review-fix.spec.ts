import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@packages/decorators/public.decorator';
import { ROLES_KEY } from '@packages/decorators/roles.decorator';
import { UploadController } from 'src/features/upload/upload.controller';
import { UploadModule } from 'src/features/upload/upload.module';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

const proto = UploadController.prototype;
const handlers = ['upload', 'uploadMultiple', 'download', 'delete'] as const;

describe('UploadController review fixes (group B)', () => {
  const reflector = new Reflector();
  const send = jest.fn();
  const controller = new UploadController({ send } as unknown as RmqProducer);
  const res = { set: jest.fn(), send: jest.fn(), setHeader: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  it.each(handlers)('%s is not @Public', (h) => {
    expect(reflector.getAllAndOverride(IS_PUBLIC_KEY, [proto[h], UploadController])).toBeFalsy();
  });

  it('delete requires ADMIN role', () => {
    const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [proto.delete, UploadController]);
    expect(roles).toEqual(['ADMIN']);
  });

  it.each(['upload', 'uploadMultiple', 'download'] as const)('%s is not ADMIN-only', (h) => {
    const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [proto[h], UploadController]);
    expect(roles ?? []).not.toContain('ADMIN');
  });

  it('multer limits: 10MB per file, max 10 files', () => {
    const imports = Reflect.getMetadata('imports', UploadModule) as any[];
    const providers = imports.flatMap((i) => i.providers ?? []);
    const prov = providers.find((p: any) => p.provide === 'MULTER_MODULE_OPTIONS');
      const opts = prov?.useFactory ? prov.useFactory() : prov?.useValue;
    expect(opts?.limits?.fileSize).toBe(10 * 1024 * 1024);
    expect(opts?.limits?.files).toBe(10);
  });

  it.each(['../etc/passwd', 'other/abc.jpg', 'uploads/../secret', '/uploads/a.jpg', 'foo'])(
    'download rejects key %s with 400 and never calls RPC',
    async (key) => {
      await expect((controller as any).download(key, res)).rejects.toBeInstanceOf(BadRequestException);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(['../etc/passwd', 'other/abc.jpg', 'uploads/../secret'])(
    'delete rejects key %s with 400 and never calls RPC',
    async (key) => {
      await expect(Promise.resolve().then(() => (controller as any).delete(key))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('download accepts uploads/ key and forwards it', async () => {
    send.mockResolvedValue({ buffer: Buffer.from('x').toString('base64') });
    await controller.download('uploads/abc.pdf', res);
    expect(send).toHaveBeenCalledWith('upload.download', { key: 'uploads/abc.pdf' });
  });

  it('delete accepts uploads/ key and forwards it', async () => {
    send.mockResolvedValue(undefined);
    await controller.delete('uploads/abc.pdf');
    expect(send).toHaveBeenCalledWith('upload.delete', { key: 'uploads/abc.pdf' });
  });

  it('download sanitizes filename in Content-Disposition (quotes, CR, LF) and sets nosniff', async () => {
    send.mockResolvedValue({ buffer: Buffer.from('x').toString('base64'), filename: 'a"b\r\nSet-Cookie: x.pdf' });
    const headers: Record<string, string> = {};
    const r = { set: jest.fn((h: any) => Object.assign(headers, h)), setHeader: jest.fn((k: string, v: string) => (headers[k] = v)), send: jest.fn() } as any;
    await controller.download('uploads/abc.pdf', r);
    const cd = headers['Content-Disposition'];
    expect(cd).toMatch(/^attachment/);
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd.match(/"/g)?.length).toBe(2);
    expect(JSON.stringify(headers)).toMatch(/nosniff/);
  });
});
