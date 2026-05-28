import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { Modal, ScrollView, TextInput } from "../src/components/SafeNative";
import { useColumnVisibility } from "../src/hooks/useColumnVisibility";
import { useSavedViews, type SavedViewSortState } from "../src/hooks/useSavedViews";
import { useOrders, type EnrichedOrder } from "../src/hooks/useOrders";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useServices } from "../src/providers/AppProviders";
import { useToast } from "../src/providers/ToastProvider";
import type { Address, MessageChannel } from "../src/domain";
import { parseRecipient } from "../src/services/local/ocrParsing";
import type { IntegrationConnection } from "../src/services/interfaces";
import type { AppTheme } from "../src/theme";
import { nowIso } from "../src/utils";

type OrderColumnKey =
  | "id"
  | "externalOrderId"
  | "integrationConnectionId"
  | "integrationConnectionName"
  | "integrationKey"
  | "integrationName"
  | "orderNumber"
  | "buyerName"
  | "buyerEmail"
  | "shipName"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "phone"
  | "availableChannels"
  | "created"
  | "linkedFulfillmentId";

const ORDER_COLUMN_KEYS: OrderColumnKey[] = [
  "id",
  "externalOrderId",
  "integrationConnectionId",
  "integrationConnectionName",
  "integrationKey",
  "integrationName",
  "orderNumber",
  "buyerName",
  "buyerEmail",
  "shipName",
  "address1",
  "address2",
  "city",
  "state",
  "postalCode",
  "phone",
  "availableChannels",
  "created",
  "linkedFulfillmentId"
];

const ORDER_COLUMN_LABELS: Record<OrderColumnKey, string> = {
  id: "Order ID",
  externalOrderId: "External Order ID",
  integrationConnectionId: "Store ID",
  integrationConnectionName: "Store Name",
  integrationKey: "Integration Key",
  integrationName: "Platform",
  orderNumber: "Order Number",
  buyerName: "Buyer Name",
  buyerEmail: "Buyer Email",
  shipName: "Ship Name",
  address1: "Address 1",
  address2: "Address 2",
  city: "City",
  state: "State",
  postalCode: "Postal Code",
  phone: "Phone",
  availableChannels: "Available Channels",
  created: "Created",
  linkedFulfillmentId: "Fulfillment ID"
};

const DEFAULT_ORDER_COLUMN_VISIBILITY: Record<OrderColumnKey, boolean> = {
  id: true,
  externalOrderId: true,
  integrationConnectionId: true,
  integrationConnectionName: true,
  integrationKey: true,
  integrationName: true,
  orderNumber: true,
  buyerName: true,
  buyerEmail: true,
  shipName: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  availableChannels: true,
  created: true,
  linkedFulfillmentId: true
};

type ManualOrderDraft = {
  storeName: string;
  integrationConnectionId: number | null;
  integrationKey: string;
  integrationName: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  shippingAddress: Address;
  availableChannels: MessageChannel[];
};

type OrderFilters = {
  id: string;
  externalOrderId: string;
  integrationConnectionId: string;
  integrationConnectionName: string;
  integrationKey: string;
  integrationName: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  shipName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  availableChannels: string;
  created: string;
  linkedFulfillmentId: string;
};

const DEFAULT_ORDER_FILTERS: OrderFilters = {
  id: "",
  externalOrderId: "",
  integrationConnectionId: "",
  integrationConnectionName: "",
  integrationKey: "",
  integrationName: "",
  orderNumber: "",
  buyerName: "",
  buyerEmail: "",
  shipName: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  availableChannels: "",
  created: "",
  linkedFulfillmentId: ""
};

type OrderSortKey =
  | "id"
  | "externalOrderId"
  | "integrationConnectionId"
  | "integrationConnectionName"
  | "integrationKey"
  | "integrationName"
  | "orderNumber"
  | "buyerName"
  | "buyerEmail"
  | "shipName"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "phone"
  | "availableChannels"
  | "created"
  | "linkedFulfillmentId";

type OrderSortState = SavedViewSortState<OrderSortKey>;

const DEFAULT_CHANNELS: MessageChannel[] = ["email", "manual"];

function formatAddress(order: {
  shippingAddress: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
}) {
  const address = order.shippingAddress;
  return [address.name, address.address1, address.address2, `${address.city}, ${address.state} ${address.postalCode}`]
    .filter(Boolean)
    .join("\n");
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function getOrderColumnValue(order: EnrichedOrder, column: OrderColumnKey) {
  switch (column) {
    case "id":
      return order.id;
    case "externalOrderId":
      return order.externalOrderId;
    case "integrationConnectionId":
      return order.integrationConnectionId ?? "";
    case "integrationConnectionName":
      return order.integrationConnectionName ?? "";
    case "integrationKey":
      return order.integrationKey;
    case "integrationName":
      return order.integrationName;
    case "orderNumber":
      return order.orderNumber;
    case "buyerName":
      return order.buyerName;
    case "buyerEmail":
      return order.buyerEmail ?? "";
    case "shipName":
      return order.shippingAddress.name;
    case "address1":
      return order.shippingAddress.address1;
    case "address2":
      return order.shippingAddress.address2 ?? "";
    case "city":
      return order.shippingAddress.city;
    case "state":
      return order.shippingAddress.state;
    case "postalCode":
      return order.shippingAddress.postalCode;
    case "phone":
      return order.shippingAddress.phone ?? "";
    case "availableChannels":
      return order.availableChannels.join(", ");
    case "created":
      return order.createdAt;
    case "linkedFulfillmentId":
      return order.linkedFulfillmentId ?? "";
  }
}

function buildOrderExportCsv(orders: EnrichedOrder[], visibleColumns: OrderColumnKey[]) {
  const header = visibleColumns.map((column) => ORDER_COLUMN_LABELS[column]);
  const rows = orders.map((order) =>
    visibleColumns.map((column) => getOrderColumnValue(order, column))
  );

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
    .join("\n");
}

function createBlankManualOrderDraft(): ManualOrderDraft {
  return {
    storeName: "",
    integrationConnectionId: null,
    integrationKey: "",
    integrationName: "",
    orderNumber: "",
    buyerName: "",
    buyerEmail: "",
    shippingAddress: {
      name: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      postalCode: "",
      phone: ""
    },
    availableChannels: DEFAULT_CHANNELS
  };
}

export default function OrdersScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { colors } = theme;
  const { showToast } = useToast();
  const styles = createStyles(theme);
  const { orders, isLoading, refresh } = useOrders();
  const { integrationAuthService, orderSyncService, storageService } = useServices();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false);
  const [isSavingManualOrder, setIsSavingManualOrder] = useState(false);
  const [isImportingLabel, setIsImportingLabel] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [pendingViewName, setPendingViewName] = useState("");
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [manualOrderDraft, setManualOrderDraft] = useState<ManualOrderDraft>(createBlankManualOrderDraft());
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [sortState, setSortState] = useState<OrderSortState>({
    key: null,
    direction: null
  });
  const { visibility, visibleColumnKeys, setVisibility, toggleColumn } = useColumnVisibility<OrderColumnKey>(
    "orders-column-visibility",
    DEFAULT_ORDER_COLUMN_VISIBILITY
  );
  const { views: savedViews, saveView, deleteView } = useSavedViews<
    OrderFilters,
    OrderColumnKey,
    OrderSortKey
  >("orders-saved-views", "orders");
  const activeSavedView = savedViews.find((view) => view.id === activeViewId);
  const viewsButtonLabel = `Views: ${activeSavedView?.name ?? "Custom"} ${isViewsMenuOpen ? "↑" : "↓"}`;

  const existingBuyerOptions = Array.from(
    new Map(
      orders.map((order) => [
        `${order.buyerName}|${order.buyerEmail ?? ""}`,
        {
          buyerEmail: order.buyerEmail ?? "",
          buyerName: order.buyerName
        }
      ])
    ).values()
  ).sort((left, right) => left.buyerName.localeCompare(right.buyerName));

  const existingShipToOptions = Array.from(
    new Map(
      orders.map((order) => [
        [
          order.shippingAddress.name,
          order.shippingAddress.address1,
          order.shippingAddress.address2 ?? "",
          order.shippingAddress.city,
          order.shippingAddress.state,
          order.shippingAddress.postalCode,
          order.shippingAddress.phone ?? ""
        ].join("|"),
        order.shippingAddress
      ])
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const platformOptions = Array.from(
    new Map(
      [
        ...connections.map((connection) => ({
          integrationKey: connection.integrationKey,
          integrationName: connection.integrationName
        })),
        ...orders.map((order) => ({
          integrationKey: order.integrationKey,
          integrationName: order.integrationName
        }))
      ].map((option) => [option.integrationKey, option])
    ).values()
  ).sort((left, right) => left.integrationName.localeCompare(right.integrationName));

  useEffect(() => {
    let isMounted = true;

    async function loadConnections() {
      const nextConnections = await integrationAuthService.listConnections();
      if (isMounted) {
        setConnections(nextConnections);
      }
    }

    void loadConnections();

    return () => {
      isMounted = false;
    };
  }, [integrationAuthService]);

  const filteredOrders = orders.filter((order) =>
    ORDER_COLUMN_KEYS.every((column) => {
      const filterValue = filters[column].trim().toLowerCase();
      if (!filterValue) {
        return true;
      }

      if (column === "created") {
        return new Date(order.createdAt).toLocaleString().toLowerCase().includes(filterValue);
      }

      return String(getOrderColumnValue(order, column)).toLowerCase().includes(filterValue);
    })
  );
  const filteredPlatformCount = new Set(filteredOrders.map((order) => order.integrationKey)).size;

  const sortedOrders = [...filteredOrders].sort((left, right) => {
    if (!sortState.key || !sortState.direction) {
      return 0;
    }

    const directionFactor = sortState.direction === "asc" ? 1 : -1;

    if (sortState.key === "created") {
      return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * directionFactor;
    }

    if (sortState.key === "id") {
      return (left.id - right.id) * directionFactor;
    }

    if (sortState.key === "integrationConnectionId") {
      return ((left.integrationConnectionId ?? -1) - (right.integrationConnectionId ?? -1)) * directionFactor;
    }

    if (sortState.key === "linkedFulfillmentId") {
      return ((left.linkedFulfillmentId ?? -1) - (right.linkedFulfillmentId ?? -1)) * directionFactor;
    }

    return String(getOrderColumnValue(left, sortState.key)).localeCompare(
      String(getOrderColumnValue(right, sortState.key))
    ) * directionFactor;
  });

  function toggleSort(key: OrderSortKey) {
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

  function updateFilter<Key extends keyof OrderFilters>(key: Key, value: OrderFilters[Key]) {
    setActiveViewId(null);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleToggleColumn(columnKey: OrderColumnKey) {
    setActiveViewId(null);
    await toggleColumn(columnKey);
  }

  function getSortArrow(key: OrderSortKey) {
    if (sortState.key !== key || !sortState.direction) {
      return "";
    }

    return sortState.direction === "asc" ? " ↑" : " ↓";
  }

  function resetManualOrderDraft() {
    setManualOrderDraft(createBlankManualOrderDraft());
  }

  function updateManualOrderDraft(
    updater: (current: ManualOrderDraft) => ManualOrderDraft
  ) {
    setManualOrderDraft((current) => updater(current));
  }

  function applyConnection(connection: IntegrationConnection) {
    updateManualOrderDraft((current) => ({
      ...current,
      storeName: connection.connectionName,
      integrationConnectionId: connection.connectionId,
      integrationKey: connection.integrationKey,
      integrationName: connection.integrationName,
      availableChannels: connection.integrationKey === "etsy"
        ? ["integration-message", "email", "manual"]
        : DEFAULT_CHANNELS
    }));
  }

  function applyPlatform(integrationKey: string, integrationName: string) {
    updateManualOrderDraft((current) => ({
      ...current,
      integrationConnectionId: current.integrationConnectionId,
      integrationKey,
      integrationName,
      availableChannels:
        integrationKey === "etsy" ? ["integration-message", "email", "manual"] : DEFAULT_CHANNELS
    }));
  }

  function toggleManualChannel(channel: MessageChannel) {
    updateManualOrderDraft((current) => {
      const nextChannels = current.availableChannels.includes(channel)
        ? current.availableChannels.filter((value) => value !== channel)
        : [...current.availableChannels, channel];
      return {
        ...current,
        availableChannels: nextChannels.length === 0 ? ["manual"] : nextChannels
      };
    });
  }

  async function handleSaveManualOrder() {
    const orderNumber = manualOrderDraft.orderNumber.trim();
    const buyerName = manualOrderDraft.buyerName.trim();
    const buyerEmail = manualOrderDraft.buyerEmail.trim();
    const storeName = manualOrderDraft.storeName.trim();
    const integrationKey = manualOrderDraft.integrationKey.trim();
    const integrationName = manualOrderDraft.integrationName.trim();
    const shippingAddress = {
      ...manualOrderDraft.shippingAddress,
      name: manualOrderDraft.shippingAddress.name.trim(),
      address1: manualOrderDraft.shippingAddress.address1.trim(),
      address2: manualOrderDraft.shippingAddress.address2?.trim() ?? "",
      city: manualOrderDraft.shippingAddress.city.trim(),
      state: manualOrderDraft.shippingAddress.state.trim(),
      postalCode: manualOrderDraft.shippingAddress.postalCode.trim(),
      phone: manualOrderDraft.shippingAddress.phone?.trim() ?? ""
    };

    if (!orderNumber || !buyerName || !shippingAddress.name || !shippingAddress.address1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode) {
      showToast("Order number, buyer, and full ship-to fields are required.", {
        variant: "error",
        durationMs: 4200
      });
      return;
    }

    if (!storeName && !integrationName) {
      showToast("Choose or enter a store or platform before saving.", {
        variant: "error",
        durationMs: 4200
      });
      return;
    }

    setIsSavingManualOrder(true);
    try {
      const nextId = orders.length > 0 ? Math.max(...orders.map((order) => order.id)) + 1 : 1;
      await storageService.saveOrders([
        {
          id: nextId,
          externalOrderId: `manual-${nextId}`,
          integrationConnectionId: manualOrderDraft.integrationConnectionId ?? undefined,
          integrationConnectionName: storeName || undefined,
          integrationKey: integrationKey || "manual",
          integrationName: integrationName || "Manual",
          orderNumber,
          buyerName,
          buyerEmail: buyerEmail || undefined,
          shippingAddress,
          availableChannels:
            buyerEmail && !manualOrderDraft.availableChannels.includes("email")
              ? [...manualOrderDraft.availableChannels, "email"]
              : manualOrderDraft.availableChannels,
          createdAt: nowIso()
        }
      ]);
      await refresh();
      setIsManualOrderOpen(false);
      resetManualOrderDraft();
      showToast("Manual order added.", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsSavingManualOrder(false);
    }
  }

  async function handleImportLabel() {
    if (Platform.OS === "web") {
      showToast("Label OCR import is available only in native iOS and Android builds.", {
        variant: "error",
        durationMs: 4200
      });
      return;
    }

    setIsImportingLabel(true);
    try {
      const TextRecognition = (await import("@react-native-ml-kit/text-recognition")).default;
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const recognition = await TextRecognition.recognize(result.assets[0].uri);
      if (!recognition.text.trim()) {
        throw new Error("No readable text was found in the selected label image.");
      }

      const recipient = parseRecipient(recognition.text);
      updateManualOrderDraft((current) => ({
        ...current,
        buyerName: recipient.name ?? current.buyerName,
        shippingAddress: {
          ...current.shippingAddress,
          name: recipient.name ?? current.shippingAddress.name,
          address1: recipient.address1 ?? current.shippingAddress.address1,
          address2: recipient.address2 ?? current.shippingAddress.address2,
          city: recipient.city ?? current.shippingAddress.city,
          state: recipient.state ?? current.shippingAddress.state,
          postalCode: recipient.postalCode ?? current.shippingAddress.postalCode,
          phone: recipient.phone ?? current.shippingAddress.phone
        }
      }));
      showToast("Label OCR imported the available recipient fields.", { variant: "success" });
    } catch (nextError) {
      const message = (nextError as Error).message;
      if (message.includes("doesn't seem to be linked")) {
        showToast(
          "Native OCR module is not linked yet. Rebuild the iOS or Android app after installing the OCR package.",
          { variant: "error", durationMs: 4200 }
        );
      } else {
        showToast(message, { variant: "error", durationMs: 4200 });
      }
    } finally {
      setIsImportingLabel(false);
    }
  }

  async function handleSync(connectionId?: number) {
    setIsSyncing(true);
    try {
      await orderSyncService.syncOrders(connectionId);
      await refresh();
      setConnections(await integrationAuthService.listConnections());
      setIsSyncMenuOpen(false);
      showToast("Orders synced.", { variant: "success" });
    } catch (nextError) {
      showToast((nextError as Error).message, { variant: "error", durationMs: 4200 });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleExport() {
    if (filteredOrders.length === 0) {
      showToast("There are no filtered orders to export.", { variant: "error", durationMs: 4200 });
      return;
    }

    setIsExporting(true);

    try {
      const csv = buildOrderExportCsv(filteredOrders, visibleColumnKeys);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `orders-export-${timestamp}.csv`;

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
          dialogTitle: "Export filtered orders",
          UTI: "public.comma-separated-values-text"
        });
      }
      showToast("Orders export is ready.", { variant: "success" });
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
    setFilters(DEFAULT_ORDER_FILTERS);
    setSortState({
      key: null,
      direction: null
    });
    await setVisibility(DEFAULT_ORDER_COLUMN_VISIBILITY);
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

  function getOrderColumnCellStyle(column: OrderColumnKey) {
    switch (column) {
      case "id":
      case "integrationConnectionId":
      case "state":
      case "linkedFulfillmentId":
        return styles.cellCompact;
      case "created":
        return styles.cellDate;
      case "address1":
      case "address2":
      case "externalOrderId":
        return styles.cellWide;
      case "availableChannels":
      case "integrationConnectionName":
      case "integrationName":
      case "integrationKey":
      case "orderNumber":
      case "buyerName":
      case "buyerEmail":
      case "shipName":
        return styles.cellMedium;
      case "city":
      case "postalCode":
      case "phone":
        return styles.cellStandard;
    }
  }

  function renderOrderCell(order: EnrichedOrder, column: OrderColumnKey) {
    if (column === "id") {
      return (
        <Pressable
          onPress={() => router.push(`/orders/${order.id}`)}
          style={styles.linkButton}
        >
          <Text style={styles.linkButtonText}>{order.id}</Text>
        </Pressable>
      );
    }

    if (column === "linkedFulfillmentId") {
      return order.linkedFulfillmentId ? (
        <Pressable
          onPress={() => router.push(`/runs/${order.linkedFulfillmentId}`)}
          style={styles.linkButton}
        >
          <Text style={styles.linkButtonText}>Open #{order.linkedFulfillmentId}</Text>
        </Pressable>
      ) : (
        <Text style={styles.cellSecondaryText}>No workflow</Text>
      );
    }

    const value = getOrderColumnValue(order, column);
    const displayValue =
      column === "created"
        ? new Date(order.createdAt).toLocaleString()
        : String(value || "—");

    return <Text style={styles.cellPrimaryText}>{displayValue}</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Orders" active="orders" />

      <View style={styles.filterActionsRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Filtered</Text>
            <Text style={styles.summaryValue}>{filteredOrders.length}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Orders</Text>
            <Text style={styles.summaryValue}>{orders.length}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryLabel}>Platforms</Text>
            <Text style={styles.summaryValue}>{filteredPlatformCount}</Text>
          </View>
        </View>

        <View style={styles.filterButtons}>
          <Pressable
            onPress={() => setIsManualOrderOpen(true)}
            style={[styles.syncButton, styles.actionButton]}
          >
            <Text style={styles.syncButtonText}>Add Order</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsSyncMenuOpen(true)}
            style={[styles.syncButton, styles.actionButton, isSyncing ? styles.buttonDisabled : null]}
            disabled={isSyncing}
          >
            <Text style={styles.syncButtonText}>{isSyncing ? "Syncing..." : "Sync Orders"}</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleExport()}
            style={[styles.exportButton, styles.actionButton, isExporting ? styles.buttonDisabled : null]}
            disabled={isExporting}
          >
            <Text style={styles.exportButtonText}>{isExporting ? "Exporting..." : "Export"}</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsCustomizeOpen(true)}
            style={[styles.clearButton, styles.actionButton]}
          >
            <Text style={styles.clearButtonText}>Columns</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPendingViewName("");
              setIsSaveViewOpen(true);
            }}
            style={[styles.clearButton, styles.actionButton]}
          >
            <Text style={styles.clearButtonText}>Save View</Text>
          </Pressable>
          <View style={[styles.viewsMenuWrap, styles.actionButtonWrap]}>
            <Pressable
              onPress={() => setIsViewsMenuOpen((current) => !current)}
              style={[
                styles.clearButton,
                styles.actionButton,
                isViewsMenuOpen ? styles.viewsMenuButtonActive : null
              ]}
            >
              <Text style={styles.clearButtonText}>{viewsButtonLabel}</Text>
            </Pressable>
            {isViewsMenuOpen ? (
              <View style={styles.viewsDropdown}>
                {savedViews.length === 0 ? (
                  <Text style={styles.viewsDropdownEmpty}>No saved order views yet.</Text>
                ) : (
                  savedViews.map((view) => (
                    <View key={view.id} style={styles.savedViewCard}>
                      <View style={styles.savedViewHeader}>
                        <Text style={styles.syncMenuOptionTitle}>{view.name}</Text>
                        <Text style={styles.savedViewMeta}>
                          {Object.values(view.visibility).filter(Boolean).length} columns
                        </Text>
                      </View>
                      <Text style={styles.syncMenuOptionMeta}>
                        Updated {new Date(view.updatedAt).toLocaleString()}
                      </Text>
                      <View style={styles.optionRow}>
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
            onPress={() => void handleClearFilters()}
            style={[styles.clearButton, styles.actionButton]}
          >
            <Text style={styles.clearButtonText}>Clear Filters</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tableCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.tableScrollContent}
        >
          <View style={styles.tableInner}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              {ORDER_COLUMN_KEYS.map((column) =>
                visibility[column] ? (
                  <Pressable
                    key={`header:${column}`}
                    onPress={() => toggleSort(column)}
                    style={[styles.tableCell, getOrderColumnCellStyle(column), styles.tableHeaderCell]}
                  >
                    <Text style={styles.tableHeaderText}>
                      {ORDER_COLUMN_LABELS[column]}{getSortArrow(column)}
                    </Text>
                  </Pressable>
                ) : null
              )}
            </View>
            <View style={[styles.tableRow, styles.tableFilterRow]}>
              {ORDER_COLUMN_KEYS.map((column) =>
                visibility[column] ? (
                  <View key={`filter:${column}`} style={[styles.tableCell, getOrderColumnCellStyle(column)]}>
                    <TextInput
                      onChangeText={(value) => updateFilter(column, value)}
                      placeholder={column === "created" ? "MM/DD/YYYY" : "Filter"}
                      placeholderTextColor={colors.muted}
                      style={styles.filterInput}
                      value={filters[column]}
                    />
                  </View>
                ) : null
              )}
            </View>

            {sortedOrders.length === 0 && !isLoading ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyTitle}>
                  {orders.length === 0 ? "No stored orders yet" : "No orders match the current filters"}
                </Text>
                <Text style={styles.emptyText}>
                  {orders.length === 0
                    ? "Sync an integration in settings or use mock mode to load seeded orders here."
                    : "Adjust or clear the filters to see more of the stored order feed."}
                </Text>
              </View>
            ) : null}

            {sortedOrders.map((order, index) => (
              <View
                key={order.id}
                style={[styles.tableRow, index % 2 === 0 ? styles.tableRowAlt : null]}
              >
                {ORDER_COLUMN_KEYS.map((column) =>
                  visibility[column] ? (
                    <View key={`${order.id}:${column}`} style={[styles.tableCell, getOrderColumnCellStyle(column)]}>
                      {renderOrderCell(order, column)}
                    </View>
                  ) : null
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={isManualOrderOpen}
        onRequestClose={() => {
          if (!isSavingManualOrder) {
            setIsManualOrderOpen(false);
          }
        }}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, styles.manualOrderModalCard]}>
            <View style={styles.syncMenuHeader}>
              <Text style={styles.syncMenuTitle}>Add Order</Text>
              <Pressable
                onPress={() => setIsManualOrderOpen(false)}
                style={styles.syncMenuCloseButton}
                disabled={isSavingManualOrder}
              >
                <Text style={styles.syncMenuCloseButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.manualOrderContent}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Store</Text>
                <TextInput
                  value={manualOrderDraft.storeName}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({ ...current, storeName: value }))
                  }
                  placeholder="Enter store name"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <View style={styles.optionRow}>
                  {connections.map((connection) => (
                    <Pressable
                      key={`store:${connection.connectionId}`}
                      onPress={() => applyConnection(connection)}
                      style={[
                        styles.openButton,
                        manualOrderDraft.integrationConnectionId === connection.connectionId
                          ? styles.columnOptionActive
                          : null
                      ]}
                    >
                      <Text style={styles.openButtonText}>{connection.connectionName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Platform</Text>
                <TextInput
                  value={manualOrderDraft.integrationName}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({ ...current, integrationName: value }))
                  }
                  placeholder="Enter platform"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <View style={styles.optionRow}>
                  {platformOptions.map((platform) => (
                    <Pressable
                      key={`platform:${platform.integrationKey}`}
                      onPress={() => applyPlatform(platform.integrationKey, platform.integrationName)}
                      style={[
                        styles.openButton,
                        manualOrderDraft.integrationKey === platform.integrationKey
                          ? styles.columnOptionActive
                          : null
                      ]}
                    >
                      <Text style={styles.openButtonText}>{platform.integrationName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Order Number</Text>
                <Pressable
                  onPress={() => void handleImportLabel()}
                  style={[styles.openButton, isImportingLabel ? styles.buttonDisabled : null]}
                  disabled={isImportingLabel}
                >
                  <Text style={styles.openButtonText}>
                    {isImportingLabel ? "Importing Label..." : "Upload Label For OCR"}
                  </Text>
                </Pressable>
                <Text style={styles.cellSecondaryText}>
                  OCR will try to fill buyer and ship-to from the label. Created date saves as today automatically.
                </Text>
                <TextInput
                  value={manualOrderDraft.orderNumber}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({ ...current, orderNumber: value }))
                  }
                  placeholder="Enter order number"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Buyer</Text>
                <TextInput
                  value={manualOrderDraft.buyerName}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({ ...current, buyerName: value }))
                  }
                  placeholder="Buyer name"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <TextInput
                  value={manualOrderDraft.buyerEmail}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({ ...current, buyerEmail: value }))
                  }
                  placeholder="Buyer email"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <View style={styles.optionRow}>
                  {existingBuyerOptions.slice(0, 8).map((buyer) => (
                    <Pressable
                      key={`buyer:${buyer.buyerName}:${buyer.buyerEmail}`}
                      onPress={() =>
                        updateManualOrderDraft((current) => ({
                          ...current,
                          buyerName: buyer.buyerName,
                          buyerEmail: buyer.buyerEmail
                        }))
                      }
                      style={styles.openButton}
                    >
                      <Text style={styles.openButtonText}>{buyer.buyerName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Ship To</Text>
                <View style={styles.optionRow}>
                  {existingShipToOptions.slice(0, 6).map((address) => (
                    <Pressable
                      key={`shipto:${address.name}:${address.address1}:${address.postalCode}`}
                      onPress={() =>
                        updateManualOrderDraft((current) => ({
                          ...current,
                          shippingAddress: { ...address }
                        }))
                      }
                      style={styles.openButton}
                    >
                      <Text style={styles.openButtonText}>{address.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={manualOrderDraft.shippingAddress.name}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({
                      ...current,
                      shippingAddress: { ...current.shippingAddress, name: value }
                    }))
                  }
                  placeholder="Recipient name"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <TextInput
                  value={manualOrderDraft.shippingAddress.address1}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({
                      ...current,
                      shippingAddress: { ...current.shippingAddress, address1: value }
                    }))
                  }
                  placeholder="Address line 1"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <TextInput
                  value={manualOrderDraft.shippingAddress.address2}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({
                      ...current,
                      shippingAddress: { ...current.shippingAddress, address2: value }
                    }))
                  }
                  placeholder="Address line 2"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
                <View style={styles.inlineFieldRow}>
                  <TextInput
                    value={manualOrderDraft.shippingAddress.city}
                    onChangeText={(value) =>
                      updateManualOrderDraft((current) => ({
                        ...current,
                        shippingAddress: { ...current.shippingAddress, city: value }
                      }))
                    }
                    placeholder="City"
                    placeholderTextColor={colors.muted}
                    style={[styles.filterInput, styles.inlineField]}
                  />
                  <TextInput
                    value={manualOrderDraft.shippingAddress.state}
                    onChangeText={(value) =>
                      updateManualOrderDraft((current) => ({
                        ...current,
                        shippingAddress: { ...current.shippingAddress, state: value }
                      }))
                    }
                    placeholder="State"
                    placeholderTextColor={colors.muted}
                    style={[styles.filterInput, styles.inlineField]}
                  />
                  <TextInput
                    value={manualOrderDraft.shippingAddress.postalCode}
                    onChangeText={(value) =>
                      updateManualOrderDraft((current) => ({
                        ...current,
                        shippingAddress: { ...current.shippingAddress, postalCode: value }
                      }))
                    }
                    placeholder="ZIP"
                    placeholderTextColor={colors.muted}
                    style={[styles.filterInput, styles.inlineField]}
                  />
                </View>
                <TextInput
                  value={manualOrderDraft.shippingAddress.phone}
                  onChangeText={(value) =>
                    updateManualOrderDraft((current) => ({
                      ...current,
                      shippingAddress: { ...current.shippingAddress, phone: value }
                    }))
                  }
                  placeholder="Phone"
                  placeholderTextColor={colors.muted}
                  style={styles.filterInput}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Channels</Text>
                <View style={styles.optionRow}>
                  {(["integration-message", "email", "manual"] as MessageChannel[]).map((channel) => (
                    <Pressable
                      key={`channel:${channel}`}
                      onPress={() => toggleManualChannel(channel)}
                      style={[
                        styles.openButton,
                        manualOrderDraft.availableChannels.includes(channel)
                          ? styles.columnOptionActive
                          : null
                      ]}
                    >
                      <Text style={styles.openButtonText}>{channel}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.filterButtons}>
                <Pressable
                  onPress={() => {
                    resetManualOrderDraft();
                    setIsManualOrderOpen(false);
                  }}
                  style={styles.clearButton}
                  disabled={isSavingManualOrder}
                >
                  <Text style={styles.clearButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleSaveManualOrder()}
                  style={[styles.syncButton, isSavingManualOrder ? styles.buttonDisabled : null]}
                  disabled={isSavingManualOrder}
                >
                  <Text style={styles.syncButtonText}>
                    {isSavingManualOrder ? "Saving..." : "Save Order"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isSyncMenuOpen}
        onRequestClose={() => {
          if (!isSyncing) {
            setIsSyncMenuOpen(false);
          }
        }}
      >
        <View style={styles.modalScrim}>
          <View style={styles.syncMenuCard}>
            <View style={styles.syncMenuHeader}>
              <Text style={styles.syncMenuTitle}>Sync Orders</Text>
              <Pressable
                onPress={() => setIsSyncMenuOpen(false)}
                style={styles.syncMenuCloseButton}
                disabled={isSyncing}
              >
                <Text style={styles.syncMenuCloseButtonText}>Close</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => void handleSync()}
              style={[styles.syncMenuOption, isSyncing ? styles.buttonDisabled : null]}
              disabled={isSyncing}
            >
              <Text style={styles.syncMenuOptionTitle}>Sync All</Text>
              <Text style={styles.syncMenuOptionMeta}>
                Pull orders from every configured integration.
              </Text>
            </Pressable>

            {connections.map((connection) => (
              <Pressable
                key={connection.connectionId}
                onPress={() => void handleSync(connection.connectionId)}
                style={[styles.syncMenuOption, isSyncing ? styles.buttonDisabled : null]}
                disabled={isSyncing}
              >
                <Text style={styles.syncMenuOptionTitle}>{connection.connectionName}</Text>
                <Text style={styles.syncMenuOptionMeta}>
                  {connection.integrationName} • {connection.mode}
                </Text>
              </Pressable>
            ))}

            {connections.length === 0 ? (
              <Text style={styles.syncMenuEmptyText}>No integrations are configured yet.</Text>
            ) : null}
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
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>View Name</Text>
              <TextInput
                value={pendingViewName}
                onChangeText={setPendingViewName}
                placeholder="Example: Etsy Follow-up"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setIsSaveViewOpen(false)} style={styles.openButton}>
                <Text style={styles.openButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleSaveView()} style={styles.syncButton}>
                <Text style={styles.syncButtonText}>Save</Text>
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
              {(
                Object.keys(DEFAULT_ORDER_COLUMN_VISIBILITY) as OrderColumnKey[]
              ).map((columnKey) => (
                <Pressable
                  key={`orders-column:${columnKey}`}
                  onPress={() => void handleToggleColumn(columnKey)}
                  style={[styles.openButton, visibility[columnKey] ? styles.columnOptionActive : null]}
                >
                  <Text style={styles.openButtonText}>
                    {ORDER_COLUMN_LABELS[columnKey]}
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
    syncButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      justifyContent: "center",
      minHeight: 30,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1
    },
    syncButtonDisabled: {
      opacity: 0.65
    },
    syncButtonText: {
      color: colors.surfaceRaised,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 13,
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
    syncMenuCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.sm,
      maxWidth: 420,
      padding: spacing.lg,
      width: "100%"
    },
    manualOrderModalCard: {
      maxHeight: "88%",
      maxWidth: 720
    },
    manualOrderContent: {
      gap: spacing.md
    },
    syncMenuHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
    fieldGroup: {
      gap: spacing.sm
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.4,
      textTransform: "uppercase"
    },
    input: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md
    },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    inlineFieldRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    inlineField: {
      flex: 1,
      minWidth: 120
    },
    syncMenuTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700"
    },
    syncMenuCloseButton: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    syncMenuCloseButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 14,
      textAlignVertical: "center"
    },
    syncMenuOption: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md
    },
    syncMenuOptionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    syncMenuOptionMeta: {
      color: colors.muted,
      fontSize: 13
    },
    syncMenuEmptyText: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    savedViewCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md
    },
    savedViewHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between"
    },
    savedViewMeta: {
      color: colors.muted,
      fontSize: 12,
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
      zIndex: 40
    },
    actionButton: {
      alignSelf: "flex-start"
    },
    actionButtonWrap: {
      alignSelf: "flex-start"
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
    exportButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      justifyContent: "center",
      minHeight: 30,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1
    },
    exportButtonText: {
      color: colors.surfaceRaised,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 13,
      textAlignVertical: "center"
    },
    clearButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 30,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1
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
      textAlign: "center",
      color: colors.text,
      fontSize: 24,
      fontWeight: "700"
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
    tableRowAlt: {
      backgroundColor: colors.surface
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
      flexBasis: 120,
      flexGrow: 0.8,
      minWidth: 120
    },
    cellStandard: {
      flexBasis: 150,
      flexGrow: 1,
      minWidth: 150
    },
    cellMedium: {
      flexBasis: 180,
      flexGrow: 1.2,
      minWidth: 180
    },
    cellWide: {
      flexBasis: 240,
      flexGrow: 1.5,
      minWidth: 240
    },
    cellDate: {
      flexBasis: 180,
      flexGrow: 1.2,
      minWidth: 180
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
    linkButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    linkButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 13,
      textAlignVertical: "center"
    },
    emptyRow: {
      gap: spacing.sm,
      minWidth: "100%",
      padding: spacing.xl
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700"
    },
    emptyText: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22
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
    modalActions: {
      flexDirection: "row",
      gap: spacing.sm
    },
    columnOptionActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderWidth: 1
    }
  });
}
