// node --test apps/android/tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { base64url, endpoints, isVersionClash, maxVersionCode, serviceAccountJwt, trackReleaseBody } from './play-lib.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = {
  client_email: 'release@flow-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
};

test('the JWT names the account, the scope and a one-hour window, and verifies', () => {
  const jwt = serviceAccountJwt(sa, 1_700_000_000);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: sa.token_uri,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.equal(v.verify(publicKey, Buffer.from(s, 'base64url')), true);
});

test('a key file missing a field is refused before any network', () => {
  assert.throws(() => serviceAccountJwt({ client_email: 'x' }), /lacks private_key/);
});

test('base64url has no padding or URL-unsafe characters', () => {
  assert.equal(base64url(Buffer.from([0xfb, 0xff, 0xbf])), '-_-_');
  assert.equal(base64url('a'), 'YQ');
});

test('the latest code is the largest on any track, 0 with none', () => {
  assert.equal(maxVersionCode({ tracks: [] }), 0);
  assert.equal(maxVersionCode(undefined), 0);
  assert.equal(
    maxVersionCode({
      tracks: [
        { track: 'internal', releases: [{ versionCodes: ['12', '14'] }, { versionCodes: ['9'] }] },
        { track: 'production', releases: [{ versionCodes: ['13'] }] },
        { track: 'alpha' },
      ],
    }),
    14,
  );
});

test('a version clash is recognised however Play words it', () => {
  assert.equal(isVersionClash('Version code 14 has already been used. Try another version code.'), true);
  assert.equal(isVersionClash('{"error":{"errors":[{"reason":"apkUpgradeVersionConflict"}]}}'), true);
  assert.equal(isVersionClash('The caller does not have permission'), false);
});

test('the track body carries one release, completed unless a draft was asked for', () => {
  assert.deepEqual(trackReleaseBody('internal', 15, '0.1.0 (15)'), {
    track: 'internal',
    releases: [{ name: '0.1.0 (15)', versionCodes: ['15'], status: 'completed' }],
  });
  assert.equal(trackReleaseBody('beta', 15, 'x', { draft: true }).releases[0].status, 'draft');
});

test('endpoints are the v3 Publishing API for the package, uploads on the media host', () => {
  const e = endpoints('im.freeflow.app');
  assert.equal(e.edits, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/im.freeflow.app/edits');
  assert.equal(e.track('E1', 'internal'), 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/im.freeflow.app/edits/E1/tracks/internal');
  assert.equal(e.bundles('E1'), 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/im.freeflow.app/edits/E1/bundles?uploadType=media');
  assert.equal(e.commit('E1'), 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/im.freeflow.app/edits/E1:commit');
});
