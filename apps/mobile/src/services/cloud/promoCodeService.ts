import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "./firebaseApp";
import type { EntitlementKey } from "./revenueCatService";

export type PromoCode = {
  code: string;
  discountPercent: number;       // 100 = fully free
  entitlement: EntitlementKey;
  durationDays: number;
  maxUses: number;
  usesRemaining: number;
  validUntil: string;            // ISO date string
  active: boolean;
};

export type RedeemedPromo = {
  code: string;
  entitlement: EntitlementKey;
  expiresAt: string;
  redeemedAt: string;
};

function getDb() {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not configured.");
  return getFirestore(app);
}

export async function redeemPromoCode(
  uid: string,
  code: string
): Promise<RedeemedPromo> {
  if (!isFirebaseConfigured()) {
    throw new Error("Cloud features not available. Configure Firebase to use promo codes.");
  }

  const db = getDb();
  const codeRef = doc(db, "promoCodes", code.toUpperCase().trim());
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    throw new Error("Promo code not found.");
  }

  const promo = codeSnap.data() as PromoCode;

  if (!promo.active) {
    throw new Error("This promo code is no longer active.");
  }

  if (promo.usesRemaining <= 0) {
    throw new Error("This promo code has reached its usage limit.");
  }

  if (new Date(promo.validUntil) < new Date()) {
    throw new Error("This promo code has expired.");
  }

  // Check user hasn't already redeemed this code
  const userPromoRef = doc(db, "users", uid, "redeemedPromos", code.toUpperCase().trim());
  const existingSnap = await getDoc(userPromoRef);
  if (existingSnap.exists()) {
    throw new Error("You have already redeemed this promo code.");
  }

  const expiresAt = new Date(
    Date.now() + promo.durationDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const redeemedPromo: RedeemedPromo = {
    code: code.toUpperCase().trim(),
    entitlement: promo.entitlement,
    expiresAt,
    redeemedAt: new Date().toISOString()
  };

  // Save to user's redeemed promos
  await setDoc(userPromoRef, { ...redeemedPromo, _savedAt: serverTimestamp() });

  // Decrement uses remaining
  await updateDoc(codeRef, { usesRemaining: increment(-1) });

  return redeemedPromo;
}

export async function getActivePromos(uid: string): Promise<RedeemedPromo[]> {
  if (!isFirebaseConfigured()) return [];

  const db = getDb();
  const { getDocs, collection } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, "users", uid, "redeemedPromos"));

  const now = new Date();
  return snap.docs
    .map((d) => {
      const data = d.data();
      const { _savedAt, ...clean } = data;
      return clean as RedeemedPromo;
    })
    .filter((promo) => new Date(promo.expiresAt) > now);
}

export type PromoEntitlements = {
  singleIntegration: boolean;
  allIntegrations: boolean;
  photoBackup: boolean;
};

export async function getPromoEntitlements(uid: string): Promise<PromoEntitlements> {
  const promos = await getActivePromos(uid);
  return {
    singleIntegration: promos.some(
      (p) => p.entitlement === "single_integration" || p.entitlement === "all_integrations"
    ),
    allIntegrations: promos.some((p) => p.entitlement === "all_integrations"),
    photoBackup: promos.some((p) => p.entitlement === "photo_backup")
  };
}
