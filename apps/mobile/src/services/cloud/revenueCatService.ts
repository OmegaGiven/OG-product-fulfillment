import { Platform } from "react-native";

// RevenueCat API keys — set these after creating products in App Store + Play Console
// Get them from app.revenuecat.com → Project → API Keys
const RC_API_KEY_IOS = "appl_REPLACE_WITH_YOUR_IOS_KEY";
const RC_API_KEY_ANDROID = "goog_REPLACE_WITH_YOUR_ANDROID_KEY";

export const RC_API_KEY = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

// RevenueCat entitlement IDs — must match exactly what you create in RC dashboard
export const ENTITLEMENT_SINGLE_INTEGRATION = "single_integration";
export const ENTITLEMENT_ALL_INTEGRATIONS = "all_integrations";
export const ENTITLEMENT_PHOTO_BACKUP = "photo_backup";

// RevenueCat package identifiers — must match your RC Offerings setup
export const PACKAGE_SINGLE = "$rc_monthly"; // single integration $5/mo offering
export const PACKAGE_PRO = "$rc_monthly";    // pro $10/mo offering
export const PACKAGE_PHOTO = "$rc_monthly";  // photo backup $3/mo offering

// Product IDs — must match exactly what you create in App Store + Play Console
export const PRODUCT_IDS = {
  singleIntegration: "productfulfillment_single_monthly",
  proIntegrations: "productfulfillment_pro_monthly",
  photoBackup: "productfulfillment_photo_backup_monthly"
} as const;

export type EntitlementKey =
  | typeof ENTITLEMENT_SINGLE_INTEGRATION
  | typeof ENTITLEMENT_ALL_INTEGRATIONS
  | typeof ENTITLEMENT_PHOTO_BACKUP;

let isConfigured = false;

export async function initRevenueCat(userId?: string): Promise<void> {
  if (RC_API_KEY.includes("REPLACE")) {
    // Not configured yet — silent no-op
    return;
  }
  try {
    const Purchases = (await import("react-native-purchases")).default;
    await Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId });
    isConfigured = true;
  } catch {
    // Native module not linked yet (happens in Expo Go) — graceful degradation
  }
}

export async function identifyUser(userId: string): Promise<void> {
  if (!isConfigured) return;
  try {
    const Purchases = (await import("react-native-purchases")).default;
    await Purchases.logIn(userId);
  } catch {}
}

export async function resetUser(): Promise<void> {
  if (!isConfigured) return;
  try {
    const Purchases = (await import("react-native-purchases")).default;
    await Purchases.logOut();
  } catch {}
}

export type ActiveEntitlements = {
  singleIntegration: boolean;
  allIntegrations: boolean;
  photoBackup: boolean;
};

export async function getActiveEntitlements(): Promise<ActiveEntitlements> {
  if (!isConfigured) {
    return { singleIntegration: false, allIntegrations: false, photoBackup: false };
  }
  try {
    const Purchases = (await import("react-native-purchases")).default;
    const info = await Purchases.getCustomerInfo();
    const entitlements = info.entitlements.active;
    return {
      singleIntegration:
        ENTITLEMENT_SINGLE_INTEGRATION in entitlements ||
        ENTITLEMENT_ALL_INTEGRATIONS in entitlements,
      allIntegrations: ENTITLEMENT_ALL_INTEGRATIONS in entitlements,
      photoBackup: ENTITLEMENT_PHOTO_BACKUP in entitlements
    };
  } catch {
    return { singleIntegration: false, allIntegrations: false, photoBackup: false };
  }
}

export type PricingPackage = {
  id: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  product: unknown;
};

export async function fetchOffering(offeringId: string): Promise<PricingPackage[]> {
  if (!isConfigured) return [];
  try {
    const Purchases = (await import("react-native-purchases")).default;
    const offerings = await Purchases.getOfferings();
    const offering =
      offerings.all[offeringId] ?? offerings.current;
    if (!offering) return [];
    return offering.availablePackages.map((pkg) => ({
      id: pkg.identifier,
      productId: pkg.product.identifier,
      title: pkg.product.title,
      description: pkg.product.description,
      priceString: pkg.product.priceString,
      product: pkg
    }));
  } catch {
    return [];
  }
}

export async function purchasePackage(pkg: PricingPackage): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    const Purchases = (await import("react-native-purchases")).default;
    const { customerInfo } = await Purchases.purchasePackage(pkg.product as never);
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch (error: unknown) {
    const msg = (error as { message?: string })?.message ?? "";
    if (msg.includes("cancel") || msg.includes("UserCancelled")) return false;
    throw error;
  }
}

export async function restorePurchases(): Promise<ActiveEntitlements> {
  if (!isConfigured) {
    return { singleIntegration: false, allIntegrations: false, photoBackup: false };
  }
  try {
    const Purchases = (await import("react-native-purchases")).default;
    await Purchases.restorePurchases();
    return getActiveEntitlements();
  } catch {
    return { singleIntegration: false, allIntegrations: false, photoBackup: false };
  }
}
