import { ArgumentsHost, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter } from 'src/packages/filters/http-exception.filter';
import { ERROR_TRANSLATIONS } from 'src/data/i18n';

function setup(language?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, json };
  const request = { url: '/auth/login', language };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { status, json, host };
}

function messageOf(json: jest.Mock): string {
  const calls = json.mock.calls as [{ message: string }][];
  return calls[calls.length - 1][0].message;
}

/** Shape the user service throws for each login outcome, as the gateway receives it over RMQ. */
const LOGIN_CASES: { name: string; code: string; status: HttpStatus; vi: string; en: string }[] = [
  {
    name: 'email does not exist',
    code: 'EMAIL_NOT_FOUND',
    status: HttpStatus.UNAUTHORIZED,
    vi: 'Email không tồn tại',
    en: 'Email does not exist',
  },
  {
    name: 'wrong password',
    code: 'INVALID_PASSWORD',
    status: HttpStatus.UNAUTHORIZED,
    vi: 'Mật khẩu không đúng',
    en: 'Invalid password',
  },
  {
    name: 'unknown user code (student/parent login)',
    code: 'USER_CODE_NOT_FOUND',
    status: HttpStatus.UNAUTHORIZED,
    vi: 'Mã người dùng không tồn tại',
    en: 'User code does not exist',
  },
  {
    name: 'account signed up with Google/Facebook (no password)',
    code: 'ACCOUNT_NO_PASSWORD',
    status: HttpStatus.UNAUTHORIZED,
    vi: 'Tài khoản này đăng nhập bằng Google/Facebook, không có mật khẩu',
    en: 'This account signs in with Google or Facebook and has no password',
  },
  {
    name: 'correct password but account deactivated',
    code: 'ACCOUNT_DEACTIVATED',
    status: HttpStatus.UNAUTHORIZED,
    vi: 'Tài khoản đã bị vô hiệu hóa',
    en: 'Account has been deactivated',
  },
  {
    name: 'session store unavailable (5xx)',
    code: 'SESSION_CHECK_UNAVAILABLE',
    status: HttpStatus.SERVICE_UNAVAILABLE,
    vi: 'Không thể xác minh phiên đăng nhập lúc này, vui lòng thử lại',
    en: 'Could not verify the session right now, please try again',
  },
];

describe('login error messages are localized (never the raw code)', () => {
  const filter = new HttpExceptionFilter();

  it.each(LOGIN_CASES)('$name → vi', ({ code, status, vi }) => {
    const { host, json } = setup('vi');
    filter.catch(new HttpException({ message: code, serviceName: 'user-service' }, status), host);
    expect(messageOf(json)).toBe(vi);
    expect(messageOf(json)).not.toBe(code);
  });

  it.each(LOGIN_CASES)('$name → en', ({ code, status, en }) => {
    const { host, json } = setup('en');
    filter.catch(new HttpException({ message: code, serviceName: 'user-service' }, status), host);
    expect(messageOf(json)).toBe(en);
    expect(messageOf(json)).not.toBe(code);
  });

  it('a plain UnauthorizedException carrying the code is localized too', () => {
    const { host, json } = setup('en');
    filter.catch(new UnauthorizedException('EMAIL_NOT_FOUND'), host);
    expect(messageOf(json)).toBe('Email does not exist');
  });

  it('rate-limit rejection is localized', () => {
    const { host, json } = setup('vi');
    filter.catch(new ThrottlerException('TOO_MANY_REQUESTS'), host);
    expect(messageOf(json)).toBe('Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau');
  });

  it('generic 500 from an unknown failure is localized, not English-only', () => {
    const { host, json } = setup('vi');
    filter.catch(new HttpException('INTERNAL_SERVER_ERROR', HttpStatus.INTERNAL_SERVER_ERROR), host);
    expect(messageOf(json)).toBe('Lỗi hệ thống, vui lòng thử lại sau');
  });

  it('every dictionary entry has a non-empty vi and en translation', () => {
    for (const [code, entry] of Object.entries(ERROR_TRANSLATIONS)) {
      expect(entry.vi).toBeTruthy();
      expect(entry.en).toBeTruthy();
      expect(entry.vi).not.toBe(code);
      expect(entry.en).not.toBe(code);
    }
  });
});
