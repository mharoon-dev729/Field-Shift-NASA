import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Safe matchMedia check for test environments
    const mql = typeof window.matchMedia !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };

    setReduced(mql.matches);

    const listener = () => setReduced(mql.matches);
    window.addEventListener("change", listener);
    return () => window.removeEventListener("change", listener);
  }, []);

  return reduced;
}