import { createECDH, createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";

export function generateClientKeypair(): { privateKey: string; publicKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    privateKey: ecdh.getPrivateKey("base64"),
    publicKey: ecdh.getPublicKey("base64"),
  };
}

export function deriveSharedKey(ourPrivateKey: string, theirPublicKey: string): Buffer {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(ourPrivateKey, "base64"));
  const sharedSecret = ecdh.computeSecret(Buffer.from(theirPublicKey, "base64"));
  // Derive a 32-byte AES key using HKDF (RFC 5869) — the standard KDF for ECDH
  return Buffer.from(hkdfSync("sha256", sharedSecret, Buffer.alloc(0), "devnet-e2e-v1", 32));
}

export function encryptBody(
  key: Buffer,
  plaintextBase64: string
): { body: string; bodyNonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = Buffer.from(plaintextBase64, "base64");
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    body: encrypted.toString("base64"),
    bodyNonce: nonce.toString("base64"),
  };
}

export function decryptBody(
  key: Buffer,
  encryptedBase64: string,
  nonceBase64: string
): string {
  const data = Buffer.from(encryptedBase64, "base64");
  const nonce = Buffer.from(nonceBase64, "base64");
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("base64");
}
