/**
 * Token encryption utilities using Node.js crypto.
 * AES-256-GCM with random IV for each encryption.
 * Key is derived from GITHUB_TOKEN_ENCRYPTION_KEY env var.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "GITHUB_TOKEN_ENCRYPTION_KEY is not set or too short (min 16 chars)"
    );
  }
  return scryptSync(raw, "framerclone-salt", KEY_LENGTH);
}

/**
 * Encrypt a plaintext string. Returns "iv:ciphertext:authTag" as hex.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

/**
 * Decrypt an encrypted token string. Returns plaintext or null on failure.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const key = getKey();
    const [ivHex, ciphertextHex, authTagHex] = encrypted.split(":");
    if (!ivHex || !ciphertextHex || !authTagHex) return null;

    const iv = Buffer.from(ivHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Migrate a plaintext token to encrypted form (idempotent).
 */
export function maybeEncryptToken(token: string | null): string | null {
  if (!token) return null;
  // Already encrypted if it contains colons and hex chars
  if (/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/i.test(token)) return token;
  try {
    return encryptToken(token);
  } catch {
    return token;
  }
}
