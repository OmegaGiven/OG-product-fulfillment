import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "./AppearanceProvider";
import { Pressable } from "../components/InteractivePressable";

type ToastVariant = "info" | "success" | "error";
type ToastContextValue = {
  showToast: (
    message: string,
    options?: {
      durationMs?: number;
      variant?: ToastVariant;
    }
  ) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 2200;

type ToastState = {
  durationMs: number;
  message: string;
  variant: ToastVariant;
} | null;

export function ToastProvider({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();
  const { colors, radius, spacing } = theme;
  const [toast, setToast] = useState<ToastState>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearToast() {
    setToast(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  useEffect(() => {
    return clearToast;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast: (message, options) => {
        const nextToast = {
          durationMs: options?.durationMs ?? TOAST_DURATION_MS,
          message,
          variant: options?.variant ?? "info"
        } satisfies NonNullable<ToastState>;

        setToast(nextToast);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          clearToast();
        }, nextToast.durationMs);
      }
    }),
    []
  );

  const styles = StyleSheet.create({
    overlay: {
      left: 0,
      paddingHorizontal: spacing.lg,
      position: "absolute",
      right: 0,
      top: Platform.OS === "web" ? spacing.lg : spacing.xl,
      zIndex: 999
    },
    toast: {
      alignSelf: "center",
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.accent,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between",
      maxWidth: 420,
      minWidth: 280,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    toastContent: {
      flex: 1,
      gap: spacing.xs
    },
    toastSuccess: {
      borderColor: colors.success
    },
    toastError: {
      borderColor: colors.danger
    },
    toastLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    toastText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20
    },
    closeButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: colors.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 28,
      minWidth: 28,
      paddingHorizontal: spacing.sm
    },
    closeButtonText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 16
    }
  });

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View
            pointerEvents="auto"
            style={[
              styles.toast,
              toast.variant === "success" ? styles.toastSuccess : null,
              toast.variant === "error" ? styles.toastError : null
            ]}
          >
            <View style={styles.toastContent}>
              <Text style={styles.toastLabel}>
                {toast.variant === "success"
                  ? "Success"
                  : toast.variant === "error"
                    ? "Action failed"
                    : "Notice"}
              </Text>
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
            <Pressable accessibilityLabel="Dismiss notification" onPress={clearToast} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
