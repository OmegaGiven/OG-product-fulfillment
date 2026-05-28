import {
  Modal as RNModal,
  ScrollView as RNScrollView,
  TextInput as RNTextInput,
  type ModalProps,
  type ScrollViewProps,
  type TextInputProps
} from "react-native";

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

export function ScrollView(props: ScrollViewProps) {
  const {
    horizontal,
    scrollEnabled,
    showsHorizontalScrollIndicator,
    showsVerticalScrollIndicator,
    ...rest
  } = props;

  return (
    <RNScrollView
      {...rest}
      horizontal={coerceBoolean(horizontal, false)}
      scrollEnabled={coerceBoolean(scrollEnabled, true)}
      showsHorizontalScrollIndicator={coerceBoolean(showsHorizontalScrollIndicator, true)}
      showsVerticalScrollIndicator={coerceBoolean(showsVerticalScrollIndicator, true)}
    />
  );
}

export function Modal(props: ModalProps) {
  const { hardwareAccelerated, statusBarTranslucent, transparent, visible, ...rest } = props;

  return (
    <RNModal
      {...rest}
      hardwareAccelerated={coerceBoolean(hardwareAccelerated, false)}
      statusBarTranslucent={coerceBoolean(statusBarTranslucent, false)}
      transparent={coerceBoolean(transparent, false)}
      visible={coerceBoolean(visible, true)}
    />
  );
}

export function TextInput(props: TextInputProps) {
  const { autoCorrect, editable, multiline, secureTextEntry, ...rest } = props;

  return (
    <RNTextInput
      {...rest}
      autoCorrect={coerceBoolean(autoCorrect, true)}
      editable={coerceBoolean(editable, true)}
      multiline={coerceBoolean(multiline, false)}
      secureTextEntry={coerceBoolean(secureTextEntry, false)}
    />
  );
}
