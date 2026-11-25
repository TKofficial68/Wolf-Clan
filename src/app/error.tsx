"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] render error", error.message);
  }, [error]);
  return (
    <div className="app-frame">
      <div className="app-body">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="text-[20px] font-bold">Something broke</p>
          <p className="muted text-[13px]">Try again. If it keeps happening, tell the team.</p>
          <button type="button" className="btn btn-primary mt-2" onClick={reset}>Retry</button>
          <Link href="/home" className="muted mt-1 text-[12px] underline">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
