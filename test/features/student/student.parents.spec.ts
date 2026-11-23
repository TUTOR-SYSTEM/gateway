import 'reflect-metadata';
import { createStudentSchema, getParentsQuerySchema } from '@packages/entities/student';
import { StudentController } from 'src/features/student/student.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

// GET /students/parents feeds the parent picker so several students can share one parent.
describe('GET /students/parents', () => {
  const build = () => {
    const send = jest.fn().mockResolvedValue({ parents: [] });
    return { send, controller: new StudentController({ send } as unknown as RmqProducer) };
  };

  it('forwards the query and the verified actor to student.findParents', async () => {
    const { send, controller } = build();
    const query = getParentsQuerySchema.parse({ search: 'tran' });

    await controller.getParents(query, { id: 'tutor-1', role: 'TUTOR' } as never);

    expect(send).toHaveBeenCalledWith(
      'student.findParents',
      expect.objectContaining({ page: 1, limit: 20, search: 'tran', actorId: 'tutor-1', actorRole: 'TUTOR' }),
    );
  });

  it('is declared before :id and limited to ADMIN and TUTOR', () => {
    const proto = StudentController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata('roles', proto.getParents)).toEqual(['ADMIN', 'TUTOR']);
    const order = Object.getOwnPropertyNames(StudentController.prototype);
    expect(order.indexOf('getParents')).toBeLessThan(order.indexOf('findById'));
  });

  it('lowercases parent emails and caps userCode at the DB length', () => {
    const ok = createStudentSchema.parse({ studentName: 'An', email: 'A@X.io', parentEmail: 'M@X.io' });
    expect(ok.email).toBe('a@x.io');
    expect(ok.parentEmail).toBe('m@x.io');
    expect(createStudentSchema.safeParse({ studentName: 'An', userCode: 'ABCDEFG' }).success).toBe(false);
  });
});
