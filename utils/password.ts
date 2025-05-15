const ENCODER = new TextEncoder();
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const DIGEST = 'SHA-256';

function toBase64(uint8: Uint8Array) {
  return btoa(String.fromCharCode(...uint8));
}

function fromBase64(str: string) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    await crypto.subtle.importKey(
      'raw',
      ENCODER.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const keyBuffer = await crypto.subtle.exportKey('raw', derivedKey);
  const keyBytes = new Uint8Array(keyBuffer);

  return `${toBase64(salt)}.${toBase64(keyBytes)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltB64, keyB64] = hash.split('.');
  const salt = fromBase64(saltB64);
  const originalKey = fromBase64(keyB64);

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    await crypto.subtle.importKey(
      'raw',
      ENCODER.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const derivedBuffer = await crypto.subtle.exportKey('raw', derivedKey);
  const derivedBytes = new Uint8Array(derivedBuffer);

  if (derivedBytes.length !== originalKey.length) return false;

  // Constant-time comparison to avoid timing attacks
  return originalKey.every((byte, i) => byte === derivedBytes[i]);
}