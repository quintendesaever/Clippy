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
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  initialShowTypePrefix,
  children,
}: {
  initialShowTypePrefix: boolean;
  children: ReactNode;
}) {
  const [showTypePrefix, setShowTypePrefixState] = useState(initialShowTypePrefix);

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

  const value = useMemo(
    () => ({ showTypePrefix, setShowTypePrefix }),
    [showTypePrefix, setShowTypePrefix]
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
