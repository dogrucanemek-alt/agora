"use client";

import { useEffect, useRef } from "react";

export default function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./skyScene")
      .then(({ mountSky }) => {
        if (!cancelled && ref.current) stop = mountSky(ref.current);
      })
      .catch((e) => {
        console.warn("3D sky off:", e);
        ref.current?.remove();
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return <canvas ref={ref} className="sky" aria-hidden="true" />;
}
