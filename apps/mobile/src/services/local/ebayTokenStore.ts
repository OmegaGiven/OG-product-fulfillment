import { getSecureJson, setSecureJson, deleteSecureItem } from "./localSecureStore";

const TOKEN_PREFIX = "integration:ebay-tokens:";

export type StoredEbayTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
};

function tokenKey(connectionId: number) {
  return `${TOKEN_PREFIX}${connectionId}`;
}

export async function getEbayTokens(connectionId: number): Promise<StoredEbayTokens | null> {
  return getSecureJson<StoredEbayTokens>(tokenKey(connectionId));
}

export async function saveEbayTokens(connectionId: number, tokens: StoredEbayTokens) {
  await setSecureJson(tokenKey(connectionId), tokens);
}

export async function clearEbayTokens(connectionId: number) {
  await deleteSecureItem(tokenKey(connectionId));
}
