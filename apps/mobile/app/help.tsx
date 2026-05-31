import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppNav } from "../src/components/AppNav";
import { Pressable } from "../src/components/InteractivePressable";
import { ScrollView } from "../src/components/SafeNative";
import { useAppTheme } from "../src/providers/AppearanceProvider";
import { useServices } from "../src/providers/AppProviders";
import { useToast } from "../src/providers/ToastProvider";
import { importCsvText, readCsvFile } from "../src/services/local/csvImportService";
import type { AppTheme } from "../src/theme";

// ── Accordion ────────────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  children,
  defaultOpen = false,
  styles,
  colors
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: AppTheme["colors"];
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {badge ? (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: colors.muted }]}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function Step({ n, text, styles }: { n: number; text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBubble}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function Tip({ text, styles }: { text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.tipRow}>
      <Text style={styles.tipIcon}>→</Text>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function PlatformTab({
  platforms,
  active,
  onSelect,
  styles,
  colors
}: {
  platforms: string[];
  active: string;
  onSelect: (p: string) => void;
  styles: ReturnType<typeof createStyles>;
  colors: AppTheme["colors"];
}) {
  return (
    <View style={styles.platformTabRow}>
      {platforms.map((p) => (
        <Pressable
          key={p}
          onPress={() => onSelect(p)}
          style={[styles.platformTab, active === p ? { backgroundColor: colors.primary } : null]}
        >
          <Text style={[styles.platformTabText, active === p ? { color: "#fff" } : { color: colors.muted }]}>
            {p}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Platform CSV instructions ─────────────────────────────────────────────────

const CSV_GUIDES: Record<string, { export: string[]; notes: string[] }> = {
  Etsy: {
    export: [
      "Open Etsy.com and sign in as a seller.",
      "Go to Shop Manager → Orders & Shipping.",
      "Click the download icon (↓) near the top right of the orders list.",
      "Select the date range you want (last 30 days, 90 days, etc.).",
      "Click 'Download CSV' — file saves to your Downloads folder.",
      "Transfer the CSV to your phone (AirDrop, Google Drive, email, etc.).",
      "Tap 'Import CSV' below and select the file."
    ],
    notes: [
      "Etsy CSV includes: Order ID, buyer name, email, shipping address, item titles.",
      "Only unshipped/open orders will appear in the fulfillment workflow.",
      "Tip: export only 'Open' orders to keep the list clean."
    ]
  },
  Squarespace: {
    export: [
      "Log in to your Squarespace account.",
      "Go to Commerce → Orders.",
      "Click the three-dot menu (⋯) at the top right of the orders list.",
      "Select 'Export Orders as CSV'.",
      "Choose your date range and click Export.",
      "File downloads to your computer — transfer to your phone.",
      "Tap 'Import CSV' below and select the file."
    ],
    notes: [
      "Requires Commerce Basic or Advanced plan for CSV export.",
      "Squarespace CSV includes: Order #, customer name, email, shipping address.",
      "For pending/unfulfilled orders only: filter by Status = Pending before exporting."
    ]
  },
  eBay: {
    export: [
      "Log in to eBay and go to Seller Hub (seller.ebay.com).",
      "Click the 'Orders' tab at the top.",
      "Use the filter to show 'Awaiting shipment' orders.",
      "Click 'Download report' (top right of the orders table).",
      "Select 'All orders' or your date range → click 'Download'.",
      "eBay emails a download link — open it and save the CSV.",
      "Transfer CSV to phone and tap 'Import CSV' below."
    ],
    notes: [
      "eBay export includes: Sales Record #, buyer name, shipping address.",
      "Buyer email may not always be in the CSV — depends on eBay privacy settings.",
      "Tip: download weekly so your order list stays current."
    ]
  },
  Amazon: {
    export: [
      "Log in to Amazon Seller Central (sellercentral.amazon.com).",
      "Go to Reports → Fulfillment → Orders → Request Report.",
      "Or: Orders → Order Reports → Request Report.",
      "Select report type 'Unshipped Orders' and your date range.",
      "Click 'Request Report' — Amazon generates it (usually under 1 minute).",
      "Download the .txt or .csv file when ready.",
      "Transfer to phone and tap 'Import CSV' below."
    ],
    notes: [
      "Amazon report is tab-separated but OG Fulfillment handles both formats.",
      "Includes: Amazon Order ID, buyer name, shipping address.",
      "Buyer email is masked by Amazon — use 'manual' channel for customer contact.",
      "Tip: request 'Unshipped Orders' report for the cleanest import."
    ]
  }
};

// ── Screen ────────────────────────────────────────────────────────────────────

const PLATFORMS = ["Etsy", "Squarespace", "eBay", "Amazon"];

export default function HelpScreen() {
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = createStyles(theme);
  const { showToast } = useToast();
  const { storageService } = useServices();
  const router = useRouter();

  const [activePlatform, setActivePlatform] = useState("Etsy");
  const [importing, setImporting] = useState(false);

  async function handleCsvImport() {
    setImporting(true);
    try {
      const csvText = await readCsvFile();
      const result = importCsvText(csvText);

      if (result.platform === "unknown") {
        showToast(result.errors[0] ?? "Could not detect platform.", { variant: "error", durationMs: 6000 });
        return;
      }

      if (result.orders.length === 0) {
        showToast("No orders found in this CSV. Check the file and try again.", { variant: "error" });
        return;
      }

      await storageService.saveOrders(result.orders);
      showToast(
        `Imported ${result.orders.length} ${result.platform} order${result.orders.length === 1 ? "" : "s"}${result.skipped > 0 ? ` (${result.skipped} skipped)` : ""}.`,
        { variant: "success" }
      );
      router.push("/orders");
    } catch (error) {
      const message = (error as Error).message;
      if (message !== "cancelled") {
        showToast(`Import failed: ${message}`, { variant: "error", durationMs: 5000 });
      }
    } finally {
      setImporting(false);
    }
  }

  const guide = CSV_GUIDES[activePlatform];

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <AppNav title="Help & Tips" />

      {/* ── CSV Import (free tier hero) ────────────────────────────── */}
      <View style={styles.importHeroCard}>
        <View style={styles.importHeroHeader}>
          <Text style={styles.importHeroTitle}>Import Orders from CSV</Text>
          <View style={styles.freePill}>
            <Text style={styles.freePillText}>FREE</Text>
          </View>
        </View>
        <Text style={styles.importHeroSub}>
          No subscription needed. Export your orders as a CSV from any platform and import them directly into OG Fulfillment for label scanning and customer messaging.
        </Text>
        <Pressable
          onPress={() => void handleCsvImport()}
          style={styles.importButton}
          disabled={importing}
        >
          <Text style={styles.importButtonText}>
            {importing ? "Importing..." : "Choose CSV File"}
          </Text>
        </Pressable>
      </View>

      {/* ── Quick start ───────────────────────────────────────────── */}
      <Section title="Quick Start" defaultOpen styles={styles} colors={colors}>
        <Step n={1} text="Import orders — use a live integration (paid) or import a CSV file (free)." styles={styles} />
        <Step n={2} text="Start a fulfillment run from the Home screen — tap 'Start Default OG Fulfillment Workflow'." styles={styles} />
        <Step n={3} text="Capture a label photo and a product photo when prompted." styles={styles} />
        <Step n={4} text="The app scans the label, extracts the address, and finds the matching order automatically." styles={styles} />
        <Step n={5} text="Review the match, preview the customer message, and tap 'Message Customer' to send." styles={styles} />
        <Step n={6} text="The order is marked complete — locally and on the platform if connected." styles={styles} />
      </Section>

      {/* ── Per-platform CSV guides ───────────────────────────────── */}
      <Section title="How to Export Orders for Each Platform" badge="FREE" styles={styles} colors={colors}>
        <Text style={styles.bodyText}>
          Select your platform for step-by-step export instructions.
        </Text>
        <PlatformTab
          platforms={PLATFORMS}
          active={activePlatform}
          onSelect={setActivePlatform}
          styles={styles}
          colors={colors}
        />
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>Export from {activePlatform}</Text>
          {guide.export.map((step, i) => (
            <Step key={i} n={i + 1} text={step} styles={styles} />
          ))}
          {guide.notes.length > 0 ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>Notes</Text>
              {guide.notes.map((note, i) => (
                <Tip key={i} text={note} styles={styles} />
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={() => void handleCsvImport()}
            style={styles.importButton}
            disabled={importing}
          >
            <Text style={styles.importButtonText}>
              {importing ? "Importing..." : `Import ${activePlatform} CSV`}
            </Text>
          </Pressable>
        </View>
      </Section>

      {/* ── Label scanning tips ───────────────────────────────────── */}
      <Section title="Tips: Label Scanning" styles={styles} colors={colors}>
        <Tip text="Hold the phone 8–12 inches above the label — far enough to capture the full address block." styles={styles} />
        <Tip text="Make sure the label is flat and fully visible, not folded or wrinkled." styles={styles} />
        <Tip text="Good lighting matters — bright even light, avoid harsh shadows across the text." styles={styles} />
        <Tip text="Capture the label photo first, then the product photo — the app scans label photos only." styles={styles} />
        <Tip text="If OCR confidence is low, try cropping out surrounding noise (e.g. QR codes or barcodes nearby)." styles={styles} />
        <Tip text="The app works best with printed labels. Handwritten labels may scan poorly." styles={styles} />
      </Section>

      {/* ── Order matching tips ───────────────────────────────────── */}
      <Section title="Tips: Order Matching" styles={styles} colors={colors}>
        <Tip text="Matching is scored by: postal code (strongest), street address, recipient name, phone." styles={styles} />
        <Tip text="If the top match looks wrong, scroll down — the correct order may be lower in the list." styles={styles} />
        <Tip text="Sync your orders before a fulfillment session to make sure the list is current." styles={styles} />
        <Tip text="If an order isn't matching, manually search by name or order number using 'Select Order Manually'." styles={styles} />
        <Tip text="PO Boxes sometimes scan differently — if matching fails, try the manual search." styles={styles} />
      </Section>

      {/* ── Live integrations ─────────────────────────────────────── */}
      <Section title="Live Integrations (Subscriptions)" styles={styles} colors={colors}>
        <Text style={styles.bodyText}>
          Live integrations sync your open orders automatically — no CSV needed. Supported platforms: Etsy, Squarespace, eBay, Amazon.
        </Text>
        <Tip text="Integrations plan ($5/mo): connect 1 platform and sync live orders." styles={styles} />
        <Tip text="Pro plan ($10/mo): connect all platforms simultaneously." styles={styles} />
        <Tip text="After connecting, tap 'Sync Orders' on the Integrations screen before each fulfillment session." styles={styles} />
        <Tip text="OAuth integrations (Etsy, eBay, Amazon) require re-authorizing every 90 days." styles={styles} />
        <Pressable
          onPress={() => router.push("/paywall")}
          style={[styles.importButton, { marginTop: 8 }]}
        >
          <Text style={styles.importButtonText}>View Plans</Text>
        </Pressable>
      </Section>

      {/* ── Cloud sync tips ───────────────────────────────────────── */}
      <Section title="Cloud Sync & Multi-Device" styles={styles} colors={colors}>
        <Tip text="Sign in via Settings → Cloud Sync to sync your workflows and runs across devices." styles={styles} />
        <Tip text="Photos stay local — only metadata syncs, not the actual image files." styles={styles} />
        <Tip text="API keys and OAuth tokens never leave your device — they are not synced to the cloud." styles={styles} />
        <Tip text="Tap 'Push to Cloud' after a session to make sure another device picks up your changes." styles={styles} />
        <Tip text="On a new device: sign in first, then tap 'Pull from Cloud' to restore all your data." styles={styles} />
      </Section>

      {/* ── Saving & resuming runs ────────────────────────────────── */}
      <Section title="Saving & Resuming Fulfillment Runs" styles={styles} colors={colors}>
        <Tip text="Every step you complete is saved automatically — you can close the app mid-run safely." styles={styles} />
        <Tip text="To exit mid-run without losing progress, tap 'Save & Exit' at the bottom of the run screen." styles={styles} />
        <Tip text="Paused runs appear on the Home screen with a 'tap to resume' label showing which step you left off on." styles={styles} />
        <Tip text="Completed runs stay on the Home screen as a log — they do not auto-delete." styles={styles} />
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <Section title="FAQ" styles={styles} colors={colors}>
        <Text style={styles.faqQ}>Does OCR require internet?</Text>
        <Text style={styles.faqA}>No. Label scanning uses on-device ML (Google ML Kit) — it works fully offline.</Text>

        <Text style={styles.faqQ}>What if I switch phones?</Text>
        <Text style={styles.faqA}>Sign in to Cloud Sync and tap 'Pull from Cloud' on your new phone. Your workflows, templates, and run history restore. Photos do not transfer (they're local files).</Text>

        <Text style={styles.faqQ}>Can I use the app without any subscriptions?</Text>
        <Text style={styles.faqA}>Yes. The full app works on free tier with mock data or CSV imports. You only need a subscription to connect live e-commerce platforms.</Text>

        <Text style={styles.faqQ}>My CSV imported but no orders appeared — why?</Text>
        <Text style={styles.faqA}>The app detects the platform from the CSV column headers. Make sure you're exporting the full orders CSV (not a summary or custom report). Supported platforms: Etsy, Squarespace, eBay, Amazon.</Text>

        <Text style={styles.faqQ}>How do I cancel my subscription?</Text>
        <Text style={styles.faqA}>
          iOS: App Store → your profile → Subscriptions → OG Fulfillment → Cancel.{"\n"}
          Android: Play Store → profile → Payments → Subscriptions → OG Fulfillment → Cancel.
        </Text>
      </Section>

      {/* ── Feedback ──────────────────────────────────────────────── */}
      <View style={styles.feedbackCard}>
        <Text style={styles.feedbackTitle}>Questions or feedback?</Text>
        <Text style={styles.bodyText}>We're a small team and read every message.</Text>
        <Pressable
          onPress={() => void Linking.openURL("mailto:support@ogfulfillment.com?subject=OG%20Fulfillment%20Support")}
          style={styles.feedbackButton}
        >
          <Text style={styles.feedbackButtonText}>Email Support</Text>
        </Pressable>
      </View>
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
    importHeroCard: {
      backgroundColor: colors.primaryDark ?? colors.primary,
      borderRadius: radius.xxl,
      gap: spacing.md,
      padding: spacing.xl
    },
    importHeroHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md
    },
    importHeroTitle: {
      color: "#ffffff",
      fontSize: 20,
      fontWeight: "700"
    },
    freePill: {
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 3
    },
    freePillText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1
    },
    importHeroSub: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 14,
      lineHeight: 21
    },
    importButton: {
      alignItems: "center",
      backgroundColor: "#ffffff",
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    importButtonText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "700"
    },
    section: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xxl,
      borderWidth: 1,
      overflow: "hidden"
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      padding: spacing.xl
    },
    sectionTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    freeBadge: {
      backgroundColor: colors.accentSoft ?? colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2
    },
    freeBadgeText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5
    },
    chevron: {
      fontSize: 12
    },
    sectionBody: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: spacing.md,
      padding: spacing.xl
    },
    stepRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.md
    },
    stepBubble: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 99,
      height: 24,
      justifyContent: "center",
      minWidth: 24
    },
    stepNum: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "800"
    },
    stepText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 21
    },
    tipRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.sm
    },
    tipIcon: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "700",
      width: 16
    },
    tipText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 21
    },
    platformTabRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm
    },
    platformTab: {
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    platformTabText: {
      fontSize: 13,
      fontWeight: "600"
    },
    guideCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg
    },
    guideTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700"
    },
    notesBox: {
      backgroundColor: colors.accentSoft ?? colors.backgroundAccent ?? colors.surfaceRaised,
      borderRadius: radius.lg,
      gap: spacing.sm,
      padding: spacing.md
    },
    notesTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700"
    },
    bodyText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 21
    },
    faqQ: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      marginTop: spacing.sm
    },
    faqA: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 21
    },
    feedbackCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: radius.xxl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.xl
    },
    feedbackTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700"
    },
    feedbackButton: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    feedbackButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700"
    }
  });
}
