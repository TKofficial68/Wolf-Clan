"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ViewerContext } from "@/lib/media-types";

const Viewer = dynamic(() => import("./media-viewer").then((module) => module.MediaViewer), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 text-white/70">…</div>
  ),
});

type OpenFn = (context: ViewerContext) => void;

const ViewerCtx = createContext<{ open: OpenFn; close: () => void } | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ViewerContext | null>(null);

  const open = useCallback<OpenFn>((next) => setContext(next), []);
  const close = useCallback(() => setContext(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <ViewerCtx.Provider value={value}>
      {children}
      {context ? <Viewer context={context} onClose={close} /> : null}
    </ViewerCtx.Provider>
  );
}

export function useViewer() {
  const ctx = useContext(ViewerCtx);
  if (!ctx) throw new Error("useViewer must be used inside ViewerProvider");
  return ctx;
}
