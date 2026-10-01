import crypto from "node:crypto";
import { getSessionSecret } from "./env.server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
// Vestigial salt from the original Remix implementation. Changing it would
// change the derived key and make every already-encrypted token
// undecryptable, so it stays until the encryption scheme is versioned.
const SALT = "remix-auth-oauth2-salt";

/**
 * The derived key, computed once per process.
 *
 * `scryptSync` is deliberately slow — that is the entire reason scrypt is used
 * here — and it was being run on every single `encrypt` and `decrypt` call.
 * `decrypt` is on the OAuth-token read path, so a dashboard render paid for a
 * full scrypt derivation each time it touched a stored token, blocking the
 * event loop while it did.
 *
 * Cached on the secret itself rather than in a bare variable so that a changed
 * `SESSION_SECRET` — in tests, or after a rotation — re-derives instead of
 * silently continuing to encrypt under the old key.
 */
let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function deriveKey(secret: string): Buffer {
  if (cachedKey && cachedSecret === secret) return cachedKey;

  const key = crypto.scryptSync(secret, SALT, 32);
  cachedSecret = secret;
  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const key = deriveKey(getSessionSecret());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, encryptedHex] = payload.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Malformed encrypted payload");
  }
  const key = deriveKey(getSessionSecret());
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}