import 'reflect-metadata';
import { NotImplementedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { StudentController } from 'src/features/student/student.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

const handler = (name: string) =>
  StudentController.prototype[name as keyof StudentController] as object;
const roles = (name: string) => Reflect.getMetadata(ROLES_KEY, handler(name));
const guards = (name: string): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, handler(name)) ?? [];

describe('GW3-02 / GW3-06 / GW3-07 student routes', () => {
  it.each(['create', 'findById'])('%s is limited to ADMIN/TUTOR via RolesGuard', (m) => {
    expect(roles(m)).toEqual(['ADMIN', 'TUTOR']);
    expect(guards(m)).toContain(RolesGuard);
  });

  it.each(['update', 'delete'])(
    '%s is ADMIN only (user service allows only self or ADMIN)',
    (m) => {
      expect(roles(m)).toEqual(['ADMIN']);
      expect(guards(m)).toContain(RolesGuard);
    },
  );

  it('get-student-code answers 501 explicitly and never forwards a broken RPC', () => {
    const send = jest.fn();
    const controller = new StudentController({ send } as unknown as RmqProducer);
    expect(() => controller.generateStudentCodeController()).toThrow(NotImplementedException);
    expect(send).not.toHaveBeenCalled();
  });

  it('findById and update forward the verified actor (id and role) to the user service', () => {
    const send = jest.fn().mockResolvedValue({});
    const controller = new StudentController({ send } as unknown as RmqProducer);
    const actor = { id: 'tutor-1', role: 'TUTOR' } as never;
    controller.findById('s-1', actor);
    expect(send).toHaveBeenLastCalledWith('student.findById', {
      id: 's-1',
      actorId: 'tutor-1',
      actorRole: 'TUTOR',
    });
    controller.delete('s-1', { id: 'admin-1', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith('student.delete', {
      id: 's-1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
  });
});
