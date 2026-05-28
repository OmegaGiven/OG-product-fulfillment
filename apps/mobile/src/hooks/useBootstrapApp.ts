import { useEffect, useState } from "react";

import { useServices } from "../providers/AppProviders";

export function useBootstrapApp() {
  const { storageService, orderSyncService } = useServices();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        await storageService.bootstrap();
        if (isMounted) {
          setIsReady(true);
        }

        void orderSyncService.syncOrders().catch((nextError) => {
          if (isMounted) {
            setError(nextError as Error);
          }
        });
      } catch (nextError) {
        if (isMounted) {
          setError(nextError as Error);
        }
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [orderSyncService, storageService]);

  return { isReady, error };
}
