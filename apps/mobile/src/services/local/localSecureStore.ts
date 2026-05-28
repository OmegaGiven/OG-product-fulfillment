import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SECURE_PREFIX = "product-fulfillment-secure-";
const MAX_KEY_LENGTH = 64;

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeSecureKey(key: string) {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const safeKey = normalized.length > 0 ? normalized : "key";
  const hashed = `${safeKey.slice(0, 32)}-${hashKey(key)}`;
  return `${SECURE_PREFIX}${hashed}`.slice(0, MAX_KEY_LENGTH);
}

function getWebKey(key: string) {
  return normalizeSecureKey(key);
}

export async function isSecureStoreBacked() {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getSecureJson<T>(key: string): Promise<T | null> {
  const raw = await getSecureItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setSecureJson(key: string, value: unknown) {
  await setSecureItem(key, JSON.stringify(value));
}

export async function deleteSecureItem(key: string) {
  const storageKey = normalizeSecureKey(key);

  if (await isSecureStoreBacked()) {
    await SecureStore.deleteItemAsync(storageKey);
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey);
  }
}

async function getSecureItem(key: string) {
  const storageKey = normalizeSecureKey(key);

  if (await isSecureStoreBacked()) {
    return SecureStore.getItemAsync(storageKey);
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(storageKey);
}

async function setSecureItem(key: string, value: string) {
  const storageKey = normalizeSecureKey(key);

  if (await isSecureStoreBacked()) {
    await SecureStore.setItemAsync(storageKey, value);
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, value);
  }
}
