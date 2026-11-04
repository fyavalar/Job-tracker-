import { base64ToBytes, bytesToBase64 } from "./format.js";

const ITERATIONS = 100000;

function encode(text) {
  return new TextEncoder().encode(text);
}

async function deriveKey(passphrase, salt, usages) {
  const material = await crypto.subtle.importKey("raw", encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function encryptSnapshot(snapshot, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encode(JSON.stringify(snapshot))));
  return {
    app: "JOBS",
    schemaVersion: 2,
    encrypted: true,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipher: bytesToBase64(cipher)
  };
}

export async function decryptSnapshot(wrapper, passphrase) {
  try {
    const salt = base64ToBytes(wrapper.salt);
    const iv = base64ToBytes(wrapper.iv);
    const cipher = base64ToBytes(wrapper.cipher);
    const key = await deriveKey(passphrase, salt, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error("That passphrase didn't open this backup.");
  }
}

export function isEncryptedBackup(data) {
  return !!(data && data.encrypted === true && data.cipher && data.salt && data.iv);
}
