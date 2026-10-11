import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { compareData, hashData } from 'src/packages/helpers/hashingData.helper';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const actualBcrypt = jest.requireActual<typeof import('bcrypt')>('bcrypt');

const hashMock = bcrypt.hash as unknown as jest.Mock;
const compareMock = bcrypt.compare as unknown as jest.Mock;

describe('hashingData helper', () => {
  beforeEach(() => {
    hashMock.mockReset().mockImplementation(actualBcrypt.hash);
    compareMock.mockReset().mockImplementation(actualBcrypt.compare);
  });

  it('hashes data so that compareData matches the original only', async () => {
    const hash = await hashData('secret-123');
    expect(hash).not.toBe('secret-123');
    await expect(compareData('secret-123', hash)).resolves.toBe(true);
    await expect(compareData('wrong', hash)).resolves.toBe(false);
  });

  it('uses 10 salt rounds', async () => {
    await hashData('x');
    expect(hashMock).toHaveBeenCalledWith('x', 10);
  });

  it('wraps a hashing failure in BadRequestException', async () => {
    hashMock.mockRejectedValueOnce(new Error('boom'));
    await expect(hashData('x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('wraps a compare failure in BadRequestException', async () => {
    compareMock.mockRejectedValueOnce(new Error('invalid salt'));
    await expect(compareData('x', 'not-a-hash')).rejects.toBeInstanceOf(BadRequestException);
  });
});
