import { useEffect, useMemo, useState } from "react";

import { getSecureJson, setSecureJson } from "../services/local/localSecureStore";

type ColumnVisibilityState<ColumnKey extends string> = Record<ColumnKey, boolean>;

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

export function useColumnVisibility<ColumnKey extends string>(
  storageKey: string,
  defaultVisibility: ColumnVisibilityState<ColumnKey>
) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState<ColumnKey>>(defaultVisibility);

  useEffect(() => {
    let isMounted = true;

    async function loadVisibility() {
      const stored = await getSecureJson<Partial<ColumnVisibilityState<ColumnKey>>>(storageKey);
      if (!isMounted || !stored) {
        return;
      }

      setVisibility((current) => {
        const nextVisibility = { ...current };
        for (const key of Object.keys(defaultVisibility) as ColumnKey[]) {
          nextVisibility[key] = normalizeBoolean(stored[key], defaultVisibility[key]);
        }
        return nextVisibility;
      });
    }

    void loadVisibility();

    return () => {
      isMounted = false;
    };
  }, [defaultVisibility, storageKey]);

  const visibleColumnKeys = useMemo(
    () => (Object.keys(visibility) as ColumnKey[]).filter((key) => visibility[key]),
    [visibility]
  );

  async function updateVisibility(nextVisibility: ColumnVisibilityState<ColumnKey>) {
    setVisibility(nextVisibility);
    await setSecureJson(storageKey, nextVisibility);
  }

  async function toggleColumn(columnKey: ColumnKey) {
    const currentlyVisible = visibility[columnKey];
    const visibleCount = Object.values(visibility).filter(Boolean).length;
    if (currentlyVisible && visibleCount <= 1) {
      return;
    }

    const nextVisibility = {
      ...visibility,
      [columnKey]: !currentlyVisible
    };
    await updateVisibility(nextVisibility);
  }

  return {
    visibility,
    visibleColumnKeys,
    setVisibility: updateVisibility,
    toggleColumn
  };
}
