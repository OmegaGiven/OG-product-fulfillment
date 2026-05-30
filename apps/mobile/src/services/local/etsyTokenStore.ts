import { getSecureJson, setSecureJson, deleteSecureItem } from "./localSecureStore";

const TOKEN_PREFIX = "integration:etsy-tokens:";

export type StoredEtsyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  shopId: number;
};

function tokenKey(connectionId: number) {
  return `${TOKEN_PREFIX}${connectionId}`;
}

export async function getEtsyTokens(connectionId: number): Promise<StoredEtsyTokens | null> {
  return getSecureJson<StoredEtsyTokens>(tokenKey(connectionId));
}

export async function saveEtsyTokens(connectionId: number, tokens: StoredEtsyTokens) {
  await setSecureJson(tokenKey(connectionId), tokens);
}

export async function clearEtsyTokens(connectionId: number) {
  await deleteSecureItem(tokenKey(connectionId));
}
