"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const PRIVACY_MODE_KEY = "treasury-ops-privacy-mode";

type PrivacyContextType = {
  privacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (enabled: boolean) => void;
};

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  togglePrivacyMode: () => {},
  setPrivacyMode: () => {}
});

export function PrivacyProvider({ children }: { children: ReactNode }): ReactNode {
  const [privacyMode, setPrivacyModeState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PRIVACY_MODE_KEY);
      if (stored !== null) {
        setPrivacyModeState(stored === "true");
      }
    } catch {
      // Storage unavailable or disabled
    }
    setMounted(true);
  }, []);

  function togglePrivacyMode(): void {
    setPrivacyModeState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PRIVACY_MODE_KEY, String(next));
      } catch {
        // Storage unavailable
      }
      return next;
    });
  }

  function setPrivacyMode(enabled: boolean): void {
    setPrivacyModeState(enabled);
    try {
      window.localStorage.setItem(PRIVACY_MODE_KEY, String(enabled));
    } catch {
      // Storage unavailable
    }
  }

  return (
    <PrivacyContext.Provider
      value={{
        privacyMode: mounted ? privacyMode : false,
        togglePrivacyMode,
        setPrivacyMode
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextType {
  return useContext(PrivacyContext);
}
