import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { savePreferences } from "../api";

type PreferencesContextValue = {
  showTypePrefix: boolean;
  setShowTypePrefix: (next: boolean) => Promise<void>;
  shareLocation: boolean;
  setShareLocation: (next: boolean) => Promise<void>;
  isAdmin: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  initialShowTypePrefix,
  initialShareLocation,
  isAdmin = false,
  children,
}: {
  initialShowTypePrefix: boolean;
  initialShareLocation: boolean;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const [showTypePrefix, setShowTypePrefixState] = useState(initialShowTypePrefix);
  const [shareLocation, setShareLocationState] = useState(initialShareLocation);

  const setShowTypePrefix = useCallback(async (next: boolean) => {
    const previous = showTypePrefix;
    setShowTypePrefixState(next);
    try {
      const saved = await savePreferences({ show_type_prefix: next });
      setShowTypePrefixState(saved.show_type_prefix);
    } catch (err) {
      setShowTypePrefixState(previous);
      throw err;
    }
  }, [showTypePrefix]);

  const setShareLocation = useCallback(async (next: boolean) => {
    const previous = shareLocation;
    setShareLocationState(next);
    try {
      const saved = await savePreferences({ share_location: next });
      setShareLocationState(saved.share_location);
    } catch (err) {
      setShareLocationState(previous);
      throw err;
    }
  }, [shareLocation]);

  const value = useMemo(
    () => ({ showTypePrefix, setShowTypePrefix, shareLocation, setShareLocation, isAdmin }),
    [showTypePrefix, setShowTypePrefix, shareLocation, setShareLocation, isAdmin]
  );

  return createElement(PreferencesContext.Provider, { value }, children);
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}

export function useShowTypePrefix() {
  return usePreferences().showTypePrefix;
}
