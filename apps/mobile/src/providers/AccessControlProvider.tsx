import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { getSecureJson, setSecureJson } from "../services/local/localSecureStore";
import {
  defaultAccessControlState,
  NAV_KEYS,
  normalizeAccessControlState,
  type AccessControlState,
  type NavKey,
  type OrgPosition,
  type PageAccessLevel
} from "../accessControl/accessControl";
import { createLocalRecordId } from "../utils";

type AccessControlContextValue = {
  activePosition: OrgPosition | null;
  canAccessPage: (page: NavKey, required?: Exclude<PageAccessLevel, "hidden">) => boolean;
  currentPageAccess: (page: NavKey) => PageAccessLevel;
  isOrgAdmin: boolean;
  personalNavVisibility: Record<NavKey, boolean>;
  positions: OrgPosition[];
  setActivePositionId: (positionId: string) => Promise<void>;
  setOrgAdmin: (value: boolean) => Promise<void>;
  setPageAccessLevel: (positionId: string, page: NavKey, level: PageAccessLevel) => Promise<void>;
  setPositionDescription: (positionId: string, description: string) => Promise<void>;
  setPositionName: (positionId: string, name: string) => Promise<void>;
  toggleNavVisibility: (page: NavKey) => Promise<void>;
  addPosition: () => Promise<void>;
  removePosition: (positionId: string) => Promise<void>;
  reloadAccessControlState: () => Promise<void>;
};

const ACCESS_CONTROL_KEY = "access-control";
const AccessControlContext = createContext<AccessControlContextValue | null>(null);

export function AccessControlProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AccessControlState>(defaultAccessControlState);

  async function loadState() {
    const stored = await getSecureJson<AccessControlState>(ACCESS_CONTROL_KEY);
    setState(normalizeAccessControlState(stored));
  }

  useEffect(() => {
    let isMounted = true;
    void getSecureJson<AccessControlState>(ACCESS_CONTROL_KEY).then((stored) => {
      if (isMounted) {
        setState(normalizeAccessControlState(stored));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<AccessControlContextValue>(() => {
    async function persist(nextState: AccessControlState) {
      const normalized = normalizeAccessControlState(nextState);
      setState(normalized);
      await setSecureJson(ACCESS_CONTROL_KEY, normalized);
    }

    const activePosition =
      state.positions.find((position) => position.id === state.activePositionId) ?? null;

    function currentPageAccess(page: NavKey): PageAccessLevel {
      if (!state.personalNavVisibility[page]) {
        return "hidden";
      }

      return activePosition?.pageAccess[page] ?? "action";
    }

    function canAccessPage(page: NavKey, required: Exclude<PageAccessLevel, "hidden"> = "read") {
      const level = currentPageAccess(page);
      if (level === "hidden") {
        return false;
      }
      if (required === "read") {
        return level === "read" || level === "action";
      }
      return level === "action";
    }

    return {
      activePosition,
      canAccessPage,
      currentPageAccess,
      isOrgAdmin: state.isOrgAdmin,
      personalNavVisibility: state.personalNavVisibility,
      positions: state.positions,
      setActivePositionId: async (positionId: string) => {
        await persist({ ...state, activePositionId: positionId });
      },
      setOrgAdmin: async (value: boolean) => {
        await persist({ ...state, isOrgAdmin: value });
      },
      setPageAccessLevel: async (positionId: string, page: NavKey, level: PageAccessLevel) => {
        await persist({
          ...state,
          positions: state.positions.map((position) =>
            position.id === positionId
              ? {
                  ...position,
                  pageAccess: {
                    ...position.pageAccess,
                    [page]: page === "user" && level === "hidden" ? "read" : level
                  }
                }
              : position
          )
        });
      },
      setPositionDescription: async (positionId: string, description: string) => {
        await persist({
          ...state,
          positions: state.positions.map((position) =>
            position.id === positionId ? { ...position, description } : position
          )
        });
      },
      setPositionName: async (positionId: string, name: string) => {
        await persist({
          ...state,
          positions: state.positions.map((position) =>
            position.id === positionId ? { ...position, name } : position
          )
        });
      },
      toggleNavVisibility: async (page: NavKey) => {
        if (page === "user") {
          return;
        }

        await persist({
          ...state,
          personalNavVisibility: {
            ...state.personalNavVisibility,
            [page]: !state.personalNavVisibility[page]
          }
        });
      },
      addPosition: async () => {
        const positionId = `position_${createLocalRecordId()}`;
        const templateAccess =
          activePosition?.pageAccess ??
          NAV_KEYS.reduce<Record<NavKey, PageAccessLevel>>((accumulator, key) => {
            accumulator[key] = "read";
            return accumulator;
          }, {} as Record<NavKey, PageAccessLevel>);

        await persist({
          ...state,
          positions: [
            ...state.positions,
            {
              id: positionId,
              name: `New Position ${state.positions.length + 1}`,
              description: "Describe this role and who should use it.",
              pageAccess: { ...templateAccess }
            }
          ]
        });
      },
      removePosition: async (positionId: string) => {
        const nextPositions = state.positions.filter((position) => position.id !== positionId);
        await persist({
          ...state,
          positions: nextPositions,
          activePositionId:
            state.activePositionId === positionId
              ? nextPositions[0]?.id ?? null
              : state.activePositionId
        });
      },
      reloadAccessControlState: loadState
    };
  }, [state]);

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

export function useAccessControl() {
  const context = useContext(AccessControlContext);
  if (!context) {
    throw new Error("useAccessControl must be used inside AccessControlProvider.");
  }
  return context;
}
