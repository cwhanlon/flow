// GET /.well-known/assetlinks.json — Android App Links (ANDROID.md phase 2).
//
// Android fetches this from the server behind an https link before letting
// the app claim it, and matches the package name plus the signing
// certificate. Two properties matter: nothing is served unless a deployment
// opts in with its own fingerprints (a 404 means "no app links here" to
// Android, which is the right default for every self-host), and the
// fingerprint list is normalised so a lower-case paste still verifies.
//
// No database — the route reads only config.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.FLOW_DATA_KEY ??= randomBytes(32).toString('base64');

const { buildApp } = await import('../src/app.js');

const FP1 = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const FP2 = '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00';

const saved = { fps: process.env.FLOW_ANDROID_CERT_SHA256, pkg: process.env.FLOW_ANDROID_PACKAGE };

beforeEach(() => {
  process.env.LOG_LEVEL = 'silent';
});

afterEach(() => {
  if (saved.fps === undefined) delete process.env.FLOW_ANDROID_CERT_SHA256;
  else process.env.FLOW_ANDROID_CERT_SHA256 = saved.fps;
  if (saved.pkg === undefined) delete process.env.FLOW_ANDROID_PACKAGE;
  else process.env.FLOW_ANDROID_PACKAGE = saved.pkg;
});

async function get() {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
  await app.close();
  return res;
}

describe('GET /.well-known/assetlinks.json', () => {
  it('is a 404 unless the deployment lists its signing fingerprints', async () => {
    delete process.env.FLOW_ANDROID_CERT_SHA256;
    const res = await get();
    expect(res.statusCode).toBe(404);
    // …and a JSON 404, not the SPA shell — Android must not mistake index.html for a statement.
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('blesses the package with every listed fingerprint, upper-cased and trimmed', async () => {
    process.env.FLOW_ANDROID_CERT_SHA256 = ` ${FP1.toLowerCase()} ,, ${FP2} `;
    delete process.env.FLOW_ANDROID_PACKAGE;
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'im.freeflow.app',
          sha256_cert_fingerprints: [FP1, FP2],
        },
      },
    ]);
  });

  it('lets a fork name its own package', async () => {
    process.env.FLOW_ANDROID_CERT_SHA256 = FP1;
    process.env.FLOW_ANDROID_PACKAGE = 'org.example.flow';
    expect((await get()).json()[0].target.package_name).toBe('org.example.flow');
  });
});
