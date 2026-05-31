import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type PropsWithChildren } from "react";

import { AccessControlProvider } from "./AccessControlProvider";
import { AppearanceProvider } from "./AppearanceProvider";
import { ToastProvider } from "./ToastProvider";
import { CloudSyncProvider } from "./CloudSyncProvider";
import type { AppServices } from "../services/interfaces";
import { createLocalServices } from "../services/local/localServices";

const ServicesContext = createContext<AppServices | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient());
  const [services] = useState(() => createLocalServices());

  return (
    <QueryClientProvider client={queryClient}>
      <AccessControlProvider>
        <AppearanceProvider>
          <ToastProvider>
            <ServicesContext.Provider value={services}>
              <CloudSyncProvider services={services}>
                {children}
              </CloudSyncProvider>
            </ServicesContext.Provider>
          </ToastProvider>
        </AppearanceProvider>
      </AccessControlProvider>
    </QueryClientProvider>
  );
}

export function useServices() {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error("useServices must be used inside AppProviders.");
  }
  return context;
}
