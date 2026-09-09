// The pure half of the Google Play Publishing client (play.mjs): token
// request, version arithmetic, error classification. No network here so it
// can be tested with `node --test`.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A signed JWT for the service account, the assertion Google's token endpoint
 * exchanges for an access token (RFC 7523). `now` is seconds since the epoch.
 */
export function serviceAccountJwt(sa, now = Math.floor(Date.now() / 1000)) {
  for (const k of ['client_email', 'private_key', 'token_uri']) {
    if (typeof sa[k] !== 'string' || !sa[k]) throw new Error(`service account JSON lacks ${k}`);
  }
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

/** The largest version code any track has ever carried, 0 when none. */
export function maxVersionCode(tracksResponse) {
  let max = 0;
  for (const t of tracksResponse?.tracks ?? []) {
    for (const r of t.releases ?? []) {
      for (const v of r.versionCodes ?? []) {
        const n = Number.parseInt(String(v), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
  }
  return max;
}

/** Play refused the upload because that version code is already taken. */
export function isVersionClash(errorText) {
  return /version code .* (has|have) already been used|already been used|apkUpgradeVersionConflict|versionCodeAlreadyUsed/i.test(String(errorText));
}

/** The body of a track update: one release carrying this bundle. */
export function trackReleaseBody(track, versionCode, versionName, { draft = false } = {}) {
  return {
    track,
    releases: [{
      name: versionName,
      versionCodes: [String(versionCode)],
      status: draft ? 'draft' : 'completed',
    }],
  };
}

/** Where the Publishing API lives for a package, plus the media-upload host. */
export function endpoints(pkg) {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`;
  const upload = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`;
  return {
    edits: `${base}/edits`,
    tracks: (editId) => `${base}/edits/${editId}/tracks`,
    track: (editId, track) => `${base}/edits/${editId}/tracks/${encodeURIComponent(track)}`,
    bundles: (editId) => `${upload}/edits/${editId}/bundles?uploadType=media`,
    commit: (editId) => `${base}/edits/${editId}:commit`,
    edit: (editId) => `${base}/edits/${editId}`,
  };
}
