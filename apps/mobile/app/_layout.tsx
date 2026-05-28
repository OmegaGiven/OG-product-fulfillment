import { useEffect } from "react";
import { Slot } from "expo-router";
import { Platform } from "react-native";

import { AppProviders } from "../src/providers/AppProviders";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const style = document.createElement("style");
    style.setAttribute("data-codex-scrollbars", "true");
    style.textContent = `
      html, body {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }

      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}
