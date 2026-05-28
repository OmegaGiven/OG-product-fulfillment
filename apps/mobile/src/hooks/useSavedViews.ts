import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { useEffect, useState } from "react";

import { getSecureJson, setSecureJson } from "../services/local/localSecureStore";
import { createLocalRecordId, nowIso } from "../utils";

export type SavedViewSortState<SortKey extends string> = {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
};

export type SavedViewRecord<
  FilterState,
  ColumnKey extends string,
  SortKey extends string
> = {
  id: string;
  name: string;
  filters: FilterState;
  visibility: Record<ColumnKey, boolean>;
  sortState: SavedViewSortState<SortKey>;
  createdAt: string;
  updatedAt: string;
};

type SavedViewBundle<
  FilterState,
  ColumnKey extends string,
  SortKey extends string
> = {
  version: 1;
  pageKey: string;
  exportedAt: string;
  views: SavedViewRecord<FilterState, ColumnKey, SortKey>[];
};

function normalizeViewName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function sanitizeFileSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "views";
}

export function useSavedViews<
  FilterState,
  ColumnKey extends string,
  SortKey extends string
>(storageKey: string, pageKey: string) {
  const [views, setViews] = useState<SavedViewRecord<FilterState, ColumnKey, SortKey>[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadViews() {
      const stored =
        (await getSecureJson<SavedViewRecord<FilterState, ColumnKey, SortKey>[]>(storageKey)) ?? [];
      if (isMounted) {
        setViews(
          stored
            .filter((entry) => typeof entry?.name === "string" && entry.name.trim().length > 0)
            .sort((left, right) => left.name.localeCompare(right.name))
        );
      }
    }

    void loadViews();

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  async function persist(nextViews: SavedViewRecord<FilterState, ColumnKey, SortKey>[]) {
    const normalized = [...nextViews].sort((left, right) => left.name.localeCompare(right.name));
    setViews(normalized);
    await setSecureJson(storageKey, normalized);
  }

  async function saveView(
    name: string,
    filters: FilterState,
    visibility: Record<ColumnKey, boolean>,
    sortState: SavedViewSortState<SortKey>
  ) {
    const normalizedName = normalizeViewName(name);
    if (!normalizedName) {
      throw new Error("Enter a name for the saved view.");
    }

    const existing = views.find(
      (entry) => entry.name.toLowerCase() === normalizedName.toLowerCase()
    );
    const timestamp = nowIso();
    const nextView: SavedViewRecord<FilterState, ColumnKey, SortKey> = {
      id: existing?.id ?? `view_${createLocalRecordId()}`,
      name: normalizedName,
      filters,
      visibility,
      sortState,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    await persist([
      ...views.filter((entry) => entry.id !== nextView.id),
      nextView
    ]);
  }

  async function deleteView(viewId: string) {
    await persist(views.filter((entry) => entry.id !== viewId));
  }

  async function exportViews() {
    if (views.length === 0) {
      throw new Error("Save at least one view before exporting.");
    }

    const exportedAt = nowIso();
    const bundle: SavedViewBundle<FilterState, ColumnKey, SortKey> = {
      version: 1,
      pageKey,
      exportedAt,
      views
    };
    const filename = `${sanitizeFileSegment(pageKey)}-saved-views-${exportedAt.replace(/[:.]/g, "-")}.json`;
    const payload = JSON.stringify(bundle, null, 2);

    if (Platform.OS === "web") {
      const blob = new Blob([payload], { type: "application/json;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return views.length;
    }

    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, payload, {
      encoding: FileSystem.EncodingType.UTF8
    });

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("View sharing is not available on this device.");
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Share saved views",
      UTI: "public.json"
    });
    return views.length;
  }

  async function importViews() {
    const pickedFile = await File.pickFileAsync(undefined, "application/json");
    const bundleFile = Array.isArray(pickedFile) ? pickedFile[0] : pickedFile;
    const bundle = JSON.parse(await bundleFile.text()) as SavedViewBundle<
      FilterState,
      ColumnKey,
      SortKey
    >;

    if (bundle.version !== 1 || bundle.pageKey !== pageKey || !Array.isArray(bundle.views)) {
      throw new Error("Selected file is not a compatible saved-view export for this page.");
    }

    const mergedByName = new Map<string, SavedViewRecord<FilterState, ColumnKey, SortKey>>();
    for (const view of views) {
      mergedByName.set(view.name.toLowerCase(), view);
    }
    for (const view of bundle.views) {
      const normalizedName = normalizeViewName(view.name);
      if (!normalizedName) {
        continue;
      }
      mergedByName.set(normalizedName.toLowerCase(), {
        ...view,
        id: `view_${createLocalRecordId()}`,
        name: normalizedName,
        updatedAt: nowIso()
      });
    }

    const mergedViews = Array.from(mergedByName.values());
    await persist(mergedViews);
    return bundle.views.length;
  }

  return {
    views,
    saveView,
    deleteView,
    exportViews,
    importViews
  };
}
