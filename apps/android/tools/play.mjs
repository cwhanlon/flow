#!/usr/bin/env node
// Google Play Publishing API, the two calls release-android.sh needs and
// nothing else. No dependencies: a service-account JWT (play-lib.mjs) and
// fetch. Node 20+.
//
//   node play.mjs latest-code
//       The largest version code on any track — what "one more than the last
//       one" is measured from. 0 for an app with no upload yet.
//   node play.mjs upload <bundle.aab> <track> <versionName> [--draft]
//       Upload the bundle, put it on the track (completed, or a draft release
//       with --draft), commit. Prints the version code Play read from the
//       bundle. Exit 3 when Play refused it because that version code is
//       already taken, so the caller can bump and retry.
//
// Env: FLOW_PLAY_SERVICE_ACCOUNT — path to the service account's JSON key
//      (a Play Console user with "Release to testing tracks" / "production");
//      FLOW_ANDROID_PACKAGE — default im.freeflow.app.
import { readFile } from 'node:fs/promises';
import { endpoints, isVersionClash, maxVersionCode, serviceAccountJwt, trackReleaseBody } from './play-lib.mjs';

const PKG = process.env.FLOW_ANDROID_PACKAGE || 'im.freeflow.app';
const API = endpoints(PKG);

function fail(msg, code = 1) {
  console.error(`play: ${msg}`);
  process.exit(code);
}

async function accessToken() {
  const path = process.env.FLOW_PLAY_SERVICE_ACCOUNT;
  if (!path) fail('FLOW_PLAY_SERVICE_ACCOUNT is not set (path to the service account JSON key)');
  const sa = JSON.parse(await readFile(path, 'utf8'));
  const assertion = serviceAccountJwt(sa);
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) fail(`token exchange failed (HTTP ${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function call(token, method, url, body, contentType = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': contentType } : {}) },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url} → HTTP ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function withEdit(token, fn) {
  const edit = await call(token, 'POST', API.edits, {});
  try {
    return await fn(edit.id);
  } catch (e) {
    await call(token, 'DELETE', API.edit(edit.id)).catch(() => {});
    throw e;
  }
}

async function latestCode() {
  const token = await accessToken();
  const max = await withEdit(token, async (id) => {
    const tracks = await call(token, 'GET', API.tracks(id));
    await call(token, 'DELETE', API.edit(id)).catch(() => {});
    return maxVersionCode(tracks);
  });
  console.log(String(max));
}

async function upload(aab, track, versionName, draft) {
  if (!aab || !track || !versionName) fail('usage: upload <bundle.aab> <track> <versionName> [--draft]');
  const token = await accessToken();
  const bytes = await readFile(aab);
  try {
    const code = await withEdit(token, async (id) => {
      const bundle = await call(token, 'POST', API.bundles(id), bytes, 'application/octet-stream');
      await call(token, 'PUT', API.track(id, track), trackReleaseBody(track, bundle.versionCode, versionName, { draft }));
      await call(token, 'POST', API.commit(id));
      return bundle.versionCode;
    });
    console.log(String(code));
  } catch (e) {
    if (isVersionClash(e.body ?? e.message)) fail(`version code already used: ${e.message}`, 3);
    throw e;
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const draft = rest.includes('--draft');
const args = rest.filter((a) => a !== '--draft');
try {
  if (cmd === 'latest-code') await latestCode();
  else if (cmd === 'upload') await upload(args[0], args[1], args[2], draft);
  else fail('usage: play.mjs latest-code | upload <bundle.aab> <track> <versionName> [--draft]', 2);
} catch (e) {
  fail(e.message);
}
