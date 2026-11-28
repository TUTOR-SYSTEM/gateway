import { withActorSignature } from 'src/features/rabbitmq/rmq.producer';
import {
  computeClientIpSignature,
  verifyOAuthProfileSignature,
  computeRpcActorSignature,
  RPC_ACTOR_MAX_AGE_MS,
  verifyClientIpSignature,
  verifyRpcActorSignature,
  verifyRpcBindSignature,
} from 'src/features/rabbitmq/rpc-actor-signature.helper';

const SECRET = 'test-rpc-actor-secret';
const NOW = 1_700_000_000_000;

function signedActor(
  overrides: Partial<{ actorId: string; actorRole: string; actorSid: string }> = {},
) {
  const actor = { actorId: 'user-1', actorRole: 'ADMIN', actorSid: 'sid-1', ...overrides };
  const actorSigTs = NOW;
  const actorSig = computeRpcActorSignature({ ...actor, actorSigTs }, SECRET);
  return { ...actor, actorSigTs, actorSig };
}

describe('rpc actor signature', () => {
  it('verifies a freshly signed actor', () => {
    expect(verifyRpcActorSignature(signedActor(), SECRET, NOW)).toBe(true);
  });

  it('rejects a forged role (signature covers the actor fields)', () => {
    const forged = { ...signedActor({ actorRole: 'STUDENT' }), actorRole: 'ADMIN' };
    expect(verifyRpcActorSignature(forged, SECRET, NOW)).toBe(false);
  });

  it('rejects an envelope older than the replay window', () => {
    const actor = signedActor();
    expect(verifyRpcActorSignature(actor, SECRET, NOW + RPC_ACTOR_MAX_AGE_MS + 1)).toBe(false);
  });

  it('rejects when the secret is missing or different (fails closed)', () => {
    expect(verifyRpcActorSignature(signedActor(), undefined, NOW)).toBe(false);
    expect(verifyRpcActorSignature(signedActor(), 'other-secret', NOW)).toBe(false);
  });

  it('rejects an unsigned actor', () => {
    expect(verifyRpcActorSignature({ actorId: 'user-1', actorRole: 'ADMIN' }, SECRET, NOW)).toBe(
      false,
    );
  });
});

describe('client IP signature', () => {
  const signedIp = (ip: string) => ({
    clientIp: ip,
    clientIpSigTs: NOW,
    clientIpSig: computeClientIpSignature(ip, NOW, SECRET),
  });

  it('returns the IP when it verifies', () => {
    expect(verifyClientIpSignature(signedIp('203.0.113.7'), SECRET, NOW)).toBe('203.0.113.7');
  });

  it('drops a tampered IP', () => {
    const tampered = { ...signedIp('203.0.113.7'), clientIp: '198.51.100.1' };
    expect(verifyClientIpSignature(tampered, SECRET, NOW)).toBeUndefined();
  });

  it('drops an unsigned or stale IP', () => {
    expect(verifyClientIpSignature({ clientIp: '203.0.113.7' }, SECRET, NOW)).toBeUndefined();
    expect(
      verifyClientIpSignature(signedIp('203.0.113.7'), SECRET, NOW + RPC_ACTOR_MAX_AGE_MS + 1),
    ).toBeUndefined();
  });
});

describe('producer signing (withActorSignature)', () => {
  const ORIGINAL = process.env.RPC_ACTOR_SECRET;
  beforeEach(() => {
    process.env.RPC_ACTOR_SECRET = SECRET;
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.RPC_ACTOR_SECRET;
    else process.env.RPC_ACTOR_SECRET = ORIGINAL;
  });

  it('signs the actor so user-service verifies it', () => {
    const out = withActorSignature({ actorId: 'user-1', actorRole: 'ADMIN', userId: 'user-1' });
    expect(
      verifyRpcActorSignature(
        {
          actorId: out.actorId,
          actorRole: out.actorRole,
          actorSid: out.actorSid,
          actorSig: out.actorSig,
          actorSigTs: out.actorSigTs,
        },
        SECRET,
      ),
    ).toBe(true);
  });

  it('signs the client IP of a login so it verifies on the user side', () => {
    const out = withActorSignature({ email: 'a@b.c', clientIp: '203.0.113.7' });
    expect(
      verifyClientIpSignature(
        { clientIp: out.clientIp, clientIpSig: out.clientIpSig, clientIpSigTs: out.clientIpSigTs },
        SECRET,
      ),
    ).toBe('203.0.113.7');
  });

  it('gives every call a fresh signature (a retry is not a replay)', async () => {
    const first = withActorSignature({ actorId: 'user-1', actorRole: 'ADMIN' });
    await new Promise((r) => setTimeout(r, 5));
    const second = withActorSignature({ actorId: 'user-1', actorRole: 'ADMIN' });
    expect(second.actorSigTs).toBeGreaterThan(first.actorSigTs);
    expect(second.actorSig).not.toBe(first.actorSig);
  });

  it('passes messages without an actor or IP through unchanged', () => {
    expect(withActorSignature({ userId: 'x' })).toEqual({ userId: 'x' });
  });

  it('fails loudly when the secret is missing', () => {
    delete process.env.RPC_ACTOR_SECRET;
    expect(() => withActorSignature({ actorId: 'user-1', actorRole: 'ADMIN' })).toThrow(
      'RPC_ACTOR_SECRET',
    );
  });
});

describe('producer signing of OAuth profiles', () => {
  const previous = process.env.RPC_ACTOR_SECRET;
  beforeAll(() => {
    process.env.RPC_ACTOR_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.RPC_ACTOR_SECRET = previous;
  });

  it('signs a Google profile so user-service can verify it', () => {
    const signed = withActorSignature({
      googleId: 'g-1',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Lee',
    }) as Record<string, unknown>;
    expect(
      verifyOAuthProfileSignature(
        'google',
        { providerId: 'g-1', email: 'ann@example.com', ...signed },
        SECRET,
      ),
    ).toBe(true);
    // The Google signature is not valid for the Facebook pattern.
    expect(
      verifyOAuthProfileSignature(
        'facebook',
        { providerId: 'g-1', email: 'ann@example.com', ...signed },
        SECRET,
      ),
    ).toBe(false);
  });

  it('signs a Facebook profile', () => {
    const signed = withActorSignature({ facebookId: 'f-1', email: 'ann@example.com' }) as Record<
      string,
      unknown
    >;
    expect(typeof signed.oauthProfileSig).toBe('string');
  });

  it('leaves payloads that are not OAuth profiles untouched', () => {
    const plain = { email: 'ann@example.com', password: 'x' };
    expect(withActorSignature(plain)).toBe(plain);
  });

  it('does not treat an actor-signed user update as an OAuth profile', () => {
    const signed = withActorSignature({
      actorId: 'u-1',
      actorRole: 'ADMIN',
      email: 'a@b.test',
      googleId: 'g-1',
    }) as Record<string, unknown>;
    expect(signed.oauthProfileSig).toBeUndefined();
    expect(typeof signed.actorSig).toBe('string');
  });
});

describe('producer actor binding', () => {
  const original = process.env.RPC_ACTOR_SECRET;
  beforeEach(() => {
    process.env.RPC_ACTOR_SECRET = 'test-secret-test-secret-test-secret-1234';
  });
  afterAll(() => {
    process.env.RPC_ACTOR_SECRET = original;
  });

  it('adds an actorBind that verifies for this pattern and payload only', () => {
    const out = withActorSignature(
      { actorId: 'user-1', actorRole: 'ADMIN', id: 'student-1' },
      'admin.deleteStudent',
    ) as Record<string, unknown>;
    const secret = process.env.RPC_ACTOR_SECRET;
    expect(verifyRpcBindSignature('admin.deleteStudent', out, secret)).toBe(true);
    expect(verifyRpcBindSignature('admin.getStudent', out, secret)).toBe(false);
    expect(verifyRpcBindSignature('admin.deleteStudent', { ...out, id: 'other' }, secret)).toBe(
      false,
    );
  });

  it('adds no bind when the caller gives no pattern', () => {
    const out = withActorSignature({ actorId: 'user-1', actorRole: 'ADMIN' }) as Record<
      string,
      unknown
    >;
    expect(out.actorBind).toBeUndefined();
  });
});
