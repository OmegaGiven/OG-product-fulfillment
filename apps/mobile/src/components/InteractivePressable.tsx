import {
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle
} from "react-native";

function resolveStyle(
  style: PressableProps["style"],
  state: PressableStateCallbackType
): ViewStyle | undefined {
  if (typeof style === "function") {
    return StyleSheet.flatten(style(state));
  }

  return StyleSheet.flatten(style);
}

function coerceBoolean(value: unknown, fallback = false) {
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

export function Pressable(props: PressableProps) {
  const { disabled, style, ...rest } = props;
  const isDisabled = coerceBoolean(disabled, false);

  return (
    <RNPressable
      {...rest}
      disabled={isDisabled}
      style={(state) => {
        const interactiveState = state as PressableStateCallbackType & {
          hovered?: boolean;
        };

        return [
          resolveStyle(style, state),
          Platform.OS === "web" ? styles.webInteractive : null,
          isDisabled ? (Platform.OS === "web" ? styles.webDisabled : styles.nativeDisabled) : null,
          interactiveState.hovered && Platform.OS === "web" && !isDisabled ? styles.hovered : null,
          state.pressed && !isDisabled
            ? (Platform.OS === "web" ? styles.webPressed : styles.nativePressed)
            : null
        ] as StyleProp<ViewStyle>;
      }}
    />
  );
}

const styles = StyleSheet.create({
  webInteractive: {
    cursor: "pointer" as const,
    boxShadow: "0px 0px 0px rgba(15, 23, 42, 0)"
  },
  hovered: {
    opacity: 0.96,
    transform: [{ translateY: -1 }],
    boxShadow: "0px 10px 24px rgba(15, 23, 42, 0.12)"
  },
  webPressed: {
    opacity: 0.88,
    transform: [{ translateY: 0 }],
    boxShadow: "0px 6px 14px rgba(15, 23, 42, 0.08)"
  },
  nativePressed: {
    opacity: 0.88,
    transform: [{ translateY: 0 }]
  },
  webDisabled: {
    opacity: 0.6,
    boxShadow: "0px 0px 0px rgba(15, 23, 42, 0)"
  },
  nativeDisabled: {
    opacity: 0.6
  }
});
