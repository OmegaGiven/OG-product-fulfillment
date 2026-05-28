import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { Modal, ScrollView, TextInput } from "../src/components/SafeNative";
import { useColumnVisibility } from "../src/hooks/useColumnVisibility";
import { useSavedViews, type SavedViewSortState } from "../src/hooks/useSavedViews";
import { useBootstrapApp } from "../src/hooks/useBootstrapApp";
import { useFulfillmentRuns } from "../src/hooks/useFulfillmentRuns";
import { useWorkflowTemplates } from "../src/hooks/useWorkflowTemplates";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useToast } from "../src/providers/ToastProvider";
import type { RecordId } from "../src/domain";
import type { AppTheme } from "../src/theme";

type FulfillmentColumnKey =
  | "fulfillmentId"
  | "name"
  | "executionMode"
  | "workflowTemplateId"
  | "currentStepIndex"
  | "stepOrder"
  | "status"
  | "matchedOrderId"
  | "selectedChannel"
  | "touchedByUsers"
  | "created"
  | "updated"
  | "actions";

const FULFILLMENT_COLUMN_KEYS: FulfillmentColumnKey[] = [
  "fulfillmentId",
  "name",
  "executionMode",
  "workflowTemplateId",
  "currentStepIndex",
  "stepOrder",
  "status",
  "matchedOrderId",
  "selectedChannel",
  "touchedByUsers",
  "created",
  "updated",
  "actions"
];

const FULFILLMENT_COLUMN_LABELS: Record<FulfillmentColumnKey, string> = {
  fulfillmentId: "Fulfillment ID",
  name: "Run Name",
  executionMode: "Execution Mode",
  workflowTemplateId: "Workflow ID",
  currentStepIndex: "Current Step Index",
  stepOrder: "Step Order",
  status: "Status",
  matchedOrderId: "Matched Order ID",
  selectedChannel: "Selected Channel",
  touchedByUsers: "Touched By Users",
  created: "Created",
  updated: "Updated",
  actions: "Actions"
};

const DEFAULT_FULFILLMENT_COLUMN_VISIBILITY: Record<FulfillmentColumnKey, boolean> = {
  fulfillmentId: true,
  name: true,
  executionMode: true,
  workflowTemplateId: true,
  currentStepIndex: true,
  stepOrder: true,
  status: true,
  matchedOrderId: true,
  selectedChannel: true,
  touchedByUsers: true,
  created: true,
  updated: true,
  actions: true
};

type FulfillmentFilters = {
  fulfillmentId: string;
  name: string;
  executionMode: string;
  workflowTemplateId: string;
  currentStepIndex: string;
  stepOrder: string;
  status: string;
  matchedOrderId: string;
  selectedChannel: string;
  touchedByUsers: string;
  created: string;
  updated: string;
};

const DEFAULT_FULFILLMENT_FILTERS: FulfillmentFilters = {
  fulfillmentId: "",
  name: "",
  executionMode: "",
  workflowTemplateId: "",
  currentStepIndex: "",
  stepOrder: "",
  status: "",
  matchedOrderId: "",
  selectedChannel: "",
  touchedByUsers: "",
  created: "",
  updated: ""
};

type FulfillmentSortKey =
  | "fulfillmentId"
  | "name"
  | "executionMode"
  | "workflowTemplateId"
  | "currentStepIndex"
  | "stepOrder"
  | "status"
  | "matchedOrderId"
  | "selectedChannel"
  | "touchedByUsers"
  | "created"
  | "updated";

type FulfillmentSortState = SavedViewSortState<FulfillmentSortKey>;

function formatRunTitle(
  workflowName: string | undefined,
  runName: string,
  fulfillmentId: RecordId
) {
  return `${workflowName ?? runName}: #${fulfillmentId}`;
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function getFulfillmentColumnValue(
  run: ReturnType<typeof useFulfillmentRuns>["runs"][number],
  column: Exclude<FulfillmentColumnKey, "actions">
) {
  switch (column) {
    case "fulfillmentId":
      return run.id;
    case "name":
      return run.name;
    case "executionMode":
      return run.executionMode;
    case "workflowTemplateId":
      return run.workflowTemplateId;
    case "currentStepIndex":
      return run.currentStepIndex;
    case "stepOrder":
      return run.stepOrder.join(", ");
    case "status":
      return run.status;
    case "matchedOrderId":
      return run.matchedOrderId ?? "";
    case "selectedChannel":
      return run.selectedChannel ?? "";
    case "touchedByUsers":
      return run.touchedByUsers.join(", ");
    case "created":
      return run.createdAt;
    case "updated":
      return run.updatedAt;
  }
}

function buildFulfillmentExportCsv(
  runs: ReturnType<typeof useFulfillmentRuns>["runs"],
  visibleColumns: FulfillmentColumnKey[]
) {
  const exportableColumns = visibleColumns.filter((column) => column !== "actions");
  const header = exportableColumns.map((column) => FULFILLMENT_COLUMN_LABELS[column]);
  const rows = runs.map((run) =>
    exportableColumns.map((column) => getFulfillmentColumnValue(run, column))
  );

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
    .join("\n");
}

export default function HistoryScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const styles = createStyles(theme);
  const { isReady, error } = useBootstrapApp();
  const { runs, deleteRun } = useFulfillmentRuns();
  const { templates } = useWorkflowTemplates();
  const [runPendingDelete, setRunPendingDelete] = useState<{
    id: RecordId;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [pendingViewName, setPendingViewName] = useState("");
  const [filters, setFilters] = useState<FulfillmentFilters>(DEFAULT_FULFILLMENT_FILTERS);
  const [sortState, setSortState] = useState<FulfillmentSortState>({
    key: null,
    direction: null
  });
  const { visibility, visibleColumnKeys, setVisibility, toggleColumn } =
    useColumnVisibility<FulfillmentColumnKey>(
      "fulfillments-column-visibility",
      DEFAULT_FULFILLMENT_COLUMN_VISIBILITY
    );
  const {
    views: savedViews,
    saveView,
    deleteView
  } = useSavedViews<FulfillmentFilters, FulfillmentColumnKey, FulfillmentSortKey>(
    "fulfillments-saved-views",
    "fulfillments"
  );
  const activeSavedView = savedViews.find((view) => view.id === activeViewId);
  const viewsButtonLabel = `Views: ${activeSavedView?.name ?? "Custom"} ${isViewsMenuOpen ? "↑" : "↓"}`;

  const filteredRuns = runs.filter((run) =>
    FULFILLMENT_COLUMN_KEYS.filter((column) => column !== "actions").every((column) => {
      const filterValue = filters[column].trim().toLowerCase();
      if (!filterValue) {
        return true;
      }

      if (column === "created") {
        return new Date(run.createdAt).toLocaleString().toLowerCase().includes(filterValue);
      }

      if (column === "updated") {
        return new Date(run.updatedAt).toLocaleString().toLowerCase().includes(filterValue);
      }

      return String(getFulfillmentColumnValue(run, column)).toLowerCase().includes(filterValue);
    })
  );

  const sortedRuns = [...filteredRuns].sort((left, right) => {
    if (!sortState.key || !sortState.direction) {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    const directionFactor = sortState.direction === "asc" ? 1 : -1;
    if (sortState.key === "created") {
      return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * directionFactor;
    }

    if (sortState.key === "updated") {
      return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * directionFactor;
    }

    if (sortState.key === "fulfillmentId") {
      return (left.id - right.id) * directionFactor;
    }

    if (sortState.key === "workflowTemplateId") {
      return (left.workflowTemplateId - right.workflowTemplateId) * directionFactor;
    }

    if (sortState.key === "currentStepIndex") {
      return (left.currentStepIndex - right.currentStepIndex) * directionFactor;
    }

    if (sortState.key === "matchedOrderId") {
      return ((left.matchedOrderId ?? -1) - (right.matchedOrderId ?? -1)) * directionFactor;
    }

    return String(getFulfillmentColumnValue(left, sortState.key)).localeCompare(
      String(getFulfillmentColumnValue(right, sortState.key))
    ) * directionFactor;
  });
  const completedRunCount = runs.filter((run) => run.status === "completed").length;
  const inProgressRunCount = runs.length - completedRunCount;

  function toggleSort(key: FulfillmentSortKey) {
    setActiveViewId(null);
    setSortState((current) => {
      if (current.key !== key) {
        return { key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }

      if (current.direction === "desc") {
        return { key: null, direction: null };
      }

      return { key, direction: "asc" };
    });
  }

  function updateFilter<Key extends keyof FulfillmentFilters>(key: Key, value: FulfillmentFilters[Key]) {
    setActiveViewId(null);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleToggleColumn(columnKey: FulfillmentColumnKey) {
    setActiveViewId(null);
    await toggleColumn(columnKey);
  }

  function getSortArrow(key: FulfillmentSortKey) {
    if (sortState.key !== key || !sortState.direction) {
      return "";
    }

    return sortState.direction === "asc" ? " ↑" : " ↓";
  }

  async function confirmDelete() {
    if (!runPendingDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteRun(runPendingDelete.id);
      showToast("Deleted fulfillment");
      setRunPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleExport() {
    if (sortedRuns.length === 0) {
      showToast("There are no fulfillments to export.", { variant: "error", durationMs: 4200 });
      return;
    }

    setIsExporting(true);
    try {
      const csv = buildFulfillmentExportCsv(sortedRuns, visibleColumnKeys);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `fulfillments-export-${timestamp}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8
        });

        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("Export sharing is not available on this device.");
        }

        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Export filtered fulfillments",
          UTI: "public.comma-separated-values-text"
        });
      }
      showToast("Fulfillments export is ready.", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsExporting(false);
    }
  }

  async function applySavedView(viewId: string) {
    const view = savedViews.find((entry) => entry.id === viewId);
    if (!view) {
      return;
    }

    setFilters(view.filters);
    setSortState(view.sortState);
    await setVisibility(view.visibility);
    setActiveViewId(view.id);
    setIsViewsMenuOpen(false);
    showToast(`Applied view "${view.name}".`, { variant: "success" });
  }

  async function handleDeleteSavedView(viewId: string) {
    await deleteView(viewId);
    setActiveViewId((current) => (current === viewId ? null : current));
    setIsViewsMenuOpen(false);
    showToast("Saved view deleted.", { variant: "success" });
  }

  async function handleClearFilters() {
    setActiveViewId(null);
    setFilters(DEFAULT_FULFILLMENT_FILTERS);
    setSortState({
      key: null,
      direction: null
    });
    await setVisibility(DEFAULT_FULFILLMENT_COLUMN_VISIBILITY);
    setIsViewsMenuOpen(false);
  }

  async function handleSaveView() {
    try {
      await saveView(pendingViewName, filters, visibility, sortState);
      setPendingViewName("");
      setIsSaveViewOpen(false);
      showToast("Saved view updated.", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    }
  }

  function getFulfillmentColumnCellStyle(column: FulfillmentColumnKey) {
    switch (column) {
      case "fulfillmentId":
      case "currentStepIndex":
        return styles.cellCompact;
      case "created":
      case "updated":
        return styles.cellDate;
      case "stepOrder":
      case "touchedByUsers":
      case "name":
        return styles.cellWide;
      case "actions":
        return styles.cellActions;
      default:
        return styles.cellStandard;
    }
  }

  function renderFulfillmentCell(run: ReturnType<typeof useFulfillmentRuns>["runs"][number], column: FulfillmentColumnKey) {
    if (column === "actions") {
      const workflow = templates.find((template) => template.id === run.workflowTemplateId);
      const runTitle = formatRunTitle(workflow?.name, run.name, run.id);

      return (
        <>
          <Pressable
            onPress={() => router.push(`/runs/${run.id}`)}
            style={styles.openButton}
          >
            <Text style={styles.openButtonText}>Open</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setRunPendingDelete({
                id: run.id,
                title: runTitle
              })
            }
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </>
      );
    }

    if (column === "matchedOrderId") {
      return run.matchedOrderId ? (
        <Pressable
          onPress={() => router.push(`/orders/${run.matchedOrderId}`)}
          style={styles.openButton}
        >
          <Text style={styles.openButtonText}>{run.matchedOrderId}</Text>
        </Pressable>
      ) : (
        <Text style={styles.cellSecondaryText}>—</Text>
      );
    }

    const value = getFulfillmentColumnValue(run, column);
    const displayValue =
      column === "created"
        ? new Date(run.createdAt).toLocaleString()
        : column === "updated"
          ? new Date(run.updatedAt).toLocaleString()
          : String(value || "—");

    return <Text style={styles.cellPrimaryText}>{displayValue}</Text>;
  }

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Preparing fulfillment history...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Fulfillments" active="history" />

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>History unavailable</Text>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      ) : null}

      <View style={styles.filterActionsRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Filtered</Text>
            <Text style={styles.summaryValue}>{filteredRuns.length}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Runs</Text>
            <Text style={styles.summaryValue}>{runs.length}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Done</Text>
            <Text style={styles.summaryValue}>{completedRunCount}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Active</Text>
            <Text style={styles.summaryValue}>{inProgressRunCount}</Text>
          </View>
        </View>

        <View style={styles.filterButtons}>
          <Pressable
            onPress={() => setIsCustomizeOpen(true)}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Columns</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPendingViewName("");
              setIsSaveViewOpen(true);
            }}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Save View</Text>
          </Pressable>
          <View style={styles.viewsMenuWrap}>
            <Pressable
              onPress={() => setIsViewsMenuOpen((current) => !current)}
              style={[styles.clearButton, isViewsMenuOpen ? styles.viewsMenuButtonActive : null]}
            >
              <Text style={styles.clearButtonText}>{viewsButtonLabel}</Text>
            </Pressable>
            {isViewsMenuOpen ? (
              <View style={styles.viewsDropdown}>
                {savedViews.length === 0 ? (
                  <Text style={styles.viewsDropdownEmpty}>No saved fulfillment views yet.</Text>
                ) : (
                  savedViews.map((view) => (
                    <View key={view.id} style={styles.savedViewCard}>
                      <Text style={styles.tableHeaderText}>{view.name}</Text>
                      <Text style={styles.errorText}>
                        Updated {new Date(view.updatedAt).toLocaleString()}
                      </Text>
                      <View style={styles.modalActions}>
                        <Pressable onPress={() => void applySavedView(view.id)} style={styles.openButton}>
                          <Text style={styles.openButtonText}>Apply</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleDeleteSavedView(view.id)}
                          style={styles.deleteButton}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => void handleExport()}
            style={[styles.clearButton, isExporting ? styles.buttonDisabled : null]}
            disabled={isExporting}
          >
            <Text style={styles.clearButtonText}>{isExporting ? "Exporting..." : "Export"}</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleClearFilters()}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Clear Filters</Text>
          </Pressable>
        </View>
      </View>

      {sortedRuns.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {runs.length === 0 ? "No fulfillment history yet" : "No fulfillments match the current filters"}
          </Text>
          <Text style={styles.emptyText}>
            {runs.length === 0
              ? "Start a workflow from Home and it will appear here with its run details."
              : "Adjust or clear the filters to see more of the saved fulfillment runs."}
          </Text>
        </View>
      ) : (
        <View style={styles.tableCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
          >
            <View style={styles.tableInner}>
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                {FULFILLMENT_COLUMN_KEYS.map((column) =>
                  visibility[column] ? (
                    column === "actions" ? (
                      <Text key={`header:${column}`} style={[styles.tableCell, getFulfillmentColumnCellStyle(column), styles.tableHeaderText]}>
                        {FULFILLMENT_COLUMN_LABELS[column]}
                      </Text>
                    ) : (
                      <Pressable
                        key={`header:${column}`}
                        onPress={() => toggleSort(column)}
                        style={[styles.tableCell, getFulfillmentColumnCellStyle(column), styles.tableHeaderCell]}
                      >
                        <Text style={styles.tableHeaderText}>
                          {FULFILLMENT_COLUMN_LABELS[column]}{getSortArrow(column)}
                        </Text>
                      </Pressable>
                    )
                  ) : null
                )}
              </View>
              <View style={[styles.tableRow, styles.tableFilterRow]}>
                {FULFILLMENT_COLUMN_KEYS.map((column) =>
                  visibility[column] ? (
                    column === "actions" ? (
                      <View key={`filter:${column}`} style={[styles.tableCell, getFulfillmentColumnCellStyle(column)]} />
                    ) : (
                      <View key={`filter:${column}`} style={[styles.tableCell, getFulfillmentColumnCellStyle(column)]}>
                        <TextInput
                          onChangeText={(value) => updateFilter(column, value)}
                          placeholder={column === "created" || column === "updated" ? "MM/DD/YYYY" : "Filter"}
                          placeholderTextColor={theme.colors.muted}
                          style={styles.filterInput}
                          value={filters[column]}
                        />
                      </View>
                    )
                  ) : null
                )}
              </View>

              {sortedRuns.map((run, index) => {
                return (
                  <View
                    key={run.id}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 ? styles.tableRowAlt : null
                    ]}
                  >
                    {FULFILLMENT_COLUMN_KEYS.map((column) =>
                      visibility[column] ? (
                        <View key={`${run.id}:${column}`} style={[styles.tableCell, getFulfillmentColumnCellStyle(column)]}>
                          {renderFulfillmentCell(run, column)}
                        </View>
                      ) : null
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={runPendingDelete !== null}
        onRequestClose={() => {
          if (!isDeleting) {
            setRunPendingDelete(null);
          }
        }}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.errorTitle}>Confirm Delete</Text>
            <Text style={styles.errorText}>
              Delete fulfillment `{runPendingDelete?.title}`? This removes the saved run history.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRunPendingDelete(null)}
                style={styles.openButton}
                disabled={isDeleting}
              >
                <Text style={styles.openButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmDelete()}
                style={styles.deleteButton}
                disabled={isDeleting}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent
        visible={isSaveViewOpen}
        onRequestClose={() => setIsSaveViewOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.errorTitle}>Save View</Text>
            <TextInput
              value={pendingViewName}
              onChangeText={setPendingViewName}
              placeholder="Example: Review Queue"
              placeholderTextColor={theme.colors.muted}
              style={styles.filterInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setIsSaveViewOpen(false)} style={styles.openButton}>
                <Text style={styles.openButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleSaveView()} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent
        visible={isCustomizeOpen}
        onRequestClose={() => setIsCustomizeOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.errorTitle}>Columns</Text>
            <View style={styles.filterButtons}>
              {(Object.keys(DEFAULT_FULFILLMENT_COLUMN_VISIBILITY) as FulfillmentColumnKey[]).map((columnKey) => (
                <Pressable
                  key={`fulfillment-column:${columnKey}`}
                  onPress={() => void handleToggleColumn(columnKey)}
                  style={[styles.openButton, visibility[columnKey] ? styles.columnOptionActive : null]}
                >
                  <Text style={styles.openButtonText}>
                    {FULFILLMENT_COLUMN_LABELS[columnKey]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setIsCustomizeOpen(false)} style={styles.openButton}>
              <Text style={styles.openButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, radius, spacing } = theme;

  return StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundWash,
      flexGrow: 1,
      gap: spacing.lg,
      padding: spacing.xl
    },
    centered: {
      alignItems: "center",
      backgroundColor: colors.backgroundWash,
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl
    },
    loadingText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700"
    },
    errorCard: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.lg
    },
    errorTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    errorText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20
    },
    filterActionsRow: {
      gap: spacing.sm,
      width: "100%",
      zIndex: 30
    },
    filterButtons: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      width: "100%",
      position: "relative",
      zIndex: 40
    },
    viewsMenuWrap: {
      position: "relative",
      zIndex: 40
    },
    viewsMenuButtonActive: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong
    },
    viewsDropdown: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      borderWidth: 1,
      elevation: 12,
      gap: spacing.sm,
      left: 0,
      marginTop: spacing.xs,
      minWidth: 280,
      padding: spacing.sm,
      position: "absolute",
      top: 32,
      zIndex: 50
    },
    viewsDropdownEmpty: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      padding: spacing.sm
    },
    buttonDisabled: {
      opacity: 0.65
    },
    clearButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 32,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2
    },
    clearButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 13,
      textAlignVertical: "center"
    },
    summaryCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      elevation: 0,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      width: "100%",
      zIndex: 0
    },
    summaryMetric: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      flexBasis: 132,
      flexGrow: 1,
      gap: spacing.xs,
      justifyContent: "center",
      minHeight: 88,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm
    },
    summaryLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
      lineHeight: 13,
      textAlign: "center",
      textTransform: "uppercase"
    },
    summaryValue: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center"
    },
    emptyCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.xl
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "700"
    },
    emptyText: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22
    },
    tableCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      overflow: "hidden",
      zIndex: 0
    },
    tableScrollContent: {
      flexGrow: 1
    },
    tableInner: {
      minWidth: "100%"
    },
    tableRow: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row"
    },
    tableHeaderRow: {
      backgroundColor: colors.surface,
      borderTopWidth: 0
    },
    tableFilterRow: {
      backgroundColor: colors.surfaceRaised
    },
    tableRowAlt: {
      backgroundColor: colors.surface
    },
    tableHeaderText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase"
    },
    tableHeaderCell: {
      justifyContent: "center"
    },
    tableCell: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    filterInput: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      color: colors.text,
      fontSize: 14,
      minHeight: 40,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    cellCompact: {
      flexBasis: 110,
      flexGrow: 0.9,
      minWidth: 110
    },
    cellStandard: {
      flexBasis: 150,
      flexGrow: 1,
      minWidth: 180
    },
    cellWide: {
      flexBasis: 260,
      flexGrow: 1.6,
      minWidth: 260
    },
    cellDate: {
      flexBasis: 180,
      flexGrow: 1.1,
      minWidth: 180
    },
    cellActions: {
      flexBasis: 170,
      flexGrow: 1,
      gap: spacing.sm,
      minWidth: 170
    },
    cellPrimaryText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700"
    },
    cellSecondaryText: {
      color: colors.muted,
      fontSize: 13
    },
    openButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    openButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 14,
      textAlignVertical: "center"
    },
    columnOptionActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent
    },
    deleteButton: {
      alignItems: "center",
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    deleteButtonText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 14,
      textAlignVertical: "center"
    },
    modalScrim: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.42)",
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg
    },
    modalCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.md,
      maxWidth: 420,
      padding: spacing.xl,
      width: "100%"
    },
    savedViewCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md
    },
    modalActions: {
      flexDirection: "row",
      gap: spacing.sm
    }
  });
}
