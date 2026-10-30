const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const JWT_BEARER_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

const JWT_HEADER = { alg: 'RS256', typ: 'JWT' };
const JWT_LIFETIME_SECONDS = 3600;
const MILLISECONDS_PER_SECOND = 1000;

/** RS256 is RSASSA-PKCS1-v1_5 over a SHA-256 digest. */
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const PRIVATE_KEY_FORMAT = 'pkcs8';

/** The `-----BEGIN/END PRIVATE KEY-----` lines and any whitespace around the base64 body. */
const PEM_ARMOR_AND_WHITESPACE = /-----[A-Z ]+-----|\s/g;

/** Base64 to base64url: swap the two URL-unsafe characters and drop the padding. */
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /=+$/;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const base64UrlEncode = (input: ArrayBuffer | string) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(BASE64_PLUS, '-')
    .replace(BASE64_SLASH, '_')
    .replace(BASE64_PADDING, '');
};

async function signJwt(serviceAccount: ServiceAccount, audience: string): Promise<string> {
  const privateKeyBytes = Uint8Array.from(
    atob(serviceAccount.private_key.replace(PEM_ARMOR_AND_WHITESPACE, '')),
    (char) => char.charCodeAt(0),
  );
  const signingKey = await crypto.subtle.importKey(
    PRIVATE_KEY_FORMAT,
    privateKeyBytes,
    RS256,
    false,
    ['sign'],
  );
  const issuedAt = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
  const unsignedToken = [
    base64UrlEncode(JSON.stringify(JWT_HEADER)),
    base64UrlEncode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: DRIVE_READONLY_SCOPE,
        aud: audience,
        iat: issuedAt,
        exp: issuedAt + JWT_LIFETIME_SECONDS,
      }),
    ),
  ].join('.');
  const signature = await crypto.subtle.sign(
    RS256,
    signingKey,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  const tokenUri = serviceAccount.token_uri ?? DEFAULT_TOKEN_URI;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': FORM_CONTENT_TYPE },
    body: new URLSearchParams({
      grant_type: JWT_BEARER_GRANT_TYPE,
      assertion: await signJwt(serviceAccount, tokenUri),
    }),
  });

  if (!response.ok) {
    throw new Error(`google token ${response.status}: ${await response.text()}`);
  }

  return ((await response.json()) as { access_token: string }).access_token;
}

/** Downloads a Drive file's content using the service account. */
export async function downloadDriveFile(serviceAccountJson: string, fileId: string) {
  const accessToken = await getAccessToken(serviceAccountJson);
  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`drive download ${response.status}: ${await response.text()}`);
  }

  return response.text();
}
