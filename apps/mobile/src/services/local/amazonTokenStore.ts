import { getSecureJson, setSecureJson, deleteSecureItem } from "./localSecureStore";

const TOKEN_PREFIX = "integration:amazon-tokens:";

export type StoredAmazonTokens = {
  accessToken: string;
  expiresAt: string; // ISO
};

function tokenKey(connectionId: number) {
  return `${TOKEN_PREFIX}${connectionId}`;
}

export async function getAmazonTokens(connectionId: number): Promise<StoredAmazonTokens | null> {
  return getSecureJson<StoredAmazonTokens>(tokenKey(connectionId));
}

export async function saveAmazonTokens(connectionId: number, tokens: StoredAmazonTokens) {
  await setSecureJson(tokenKey(connectionId), tokens);
}

export async function clearAmazonTokens(connectionId: number) {
  await deleteSecureItem(tokenKey(connectionId));
}
