"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AppHeaderContextValue = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const AppHeaderContext = createContext<AppHeaderContextValue | null>(null);

export function AppHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null);
  const setTitle = useCallback((next: string | null) => {
    setTitleState(next);
  }, []);
  const value = useMemo(() => ({ title, setTitle }), [title, setTitle]);
  return <AppHeaderContext value={value}>{children}</AppHeaderContext>;
}

export function useAppHeaderTitle(): string | null {
  return useContext(AppHeaderContext)?.title ?? null;
}

export function AppHeaderTitle({ title }: { title: string }) {
  const setTitle = useContext(AppHeaderContext)?.setTitle;
  useEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
  return null;
}
