import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type PropsWithChildren
} from "react";
import {
  initRevenueCat,
  getActiveEntitlements,
  restorePurchases,
  identifyUser,
  resetUser,
  type ActiveEntitlements
} from "../services/cloud/revenueCatService";
import { getPromoEntitlements } from "../services/cloud/promoCodeService";
import { useCloudSync } from "./CloudSyncProvider";

export type Entitlements = {
  // true if user can connect a live e-commerce integration
  canUseSingleIntegration: boolean;
  // true if user can connect ALL integrations (unlimited)
  canUseAllIntegrations: boolean;
  // true if user can back up photos to cloud
  canUsePhotoBackup: boolean;
  // source breakdown for debugging
  fromPurchase: ActiveEntitlements;
  fromPromo: ActiveEntitlements;
};

type EntitlementContextValue = {
  entitlements: Entitlements;
  isLoading: boolean;
  refresh: () => Promise<void>;
  liveIntegrationCount: number;
  setLiveIntegrationCount: (n: number) => void;
};

const DEFAULT_ENTITLEMENTS: Entitlements = {
  canUseSingleIntegration: false,
  canUseAllIntegrations: false,
  canUsePhotoBackup: false,
  fromPurchase: { singleIntegration: false, allIntegrations: false, photoBackup: false },
  fromPromo: { singleIntegration: false, allIntegrations: false, photoBackup: false }
};

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlements: DEFAULT_ENTITLEMENTS,
  isLoading: true,
  refresh: async () => {},
  liveIntegrationCount: 0,
  setLiveIntegrationCount: () => {}
});

export function EntitlementProvider({ children }: PropsWithChildren) {
  const { user } = useCloudSync();
  const [entitlements, setEntitlements] = useState<Entitlements>(DEFAULT_ENTITLEMENTS);
  const [isLoading, setIsLoading] = useState(true);
  const [liveIntegrationCount, setLiveIntegrationCount] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await initRevenueCat(user?.uid);

      const [purchase, promo] = await Promise.all([
        getActiveEntitlements(),
        user ? getPromoEntitlements(user.uid) : Promise.resolve({
          singleIntegration: false,
          allIntegrations: false,
          photoBackup: false
        })
      ]);

      setEntitlements({
        canUseSingleIntegration:
          purchase.singleIntegration || purchase.allIntegrations ||
          promo.singleIntegration || promo.allIntegrations,
        canUseAllIntegrations:
          purchase.allIntegrations || promo.allIntegrations,
        canUsePhotoBackup:
          purchase.photoBackup || promo.photoBackup,
        fromPurchase: purchase,
        fromPromo: promo
      });
    } catch {
      // Fail open — don't block app if entitlement check fails
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  // Re-identify with RevenueCat when auth changes
  useEffect(() => {
    if (user) {
      void identifyUser(user.uid).then(() => refresh());
    } else {
      void resetUser().then(() => refresh());
    }
  }, [user?.uid]);

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <EntitlementContext.Provider
      value={{ entitlements, isLoading, refresh, liveIntegrationCount, setLiveIntegrationCount }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  return useContext(EntitlementContext);
}
