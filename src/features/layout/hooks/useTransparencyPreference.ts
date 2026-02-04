import { useEffect, useState } from "react";

export function useTransparencyPreference(storageKey = "reduceTransparency") {
  const [reduceTransparency, setReduceTransparency] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    // Default to true (reduce transparency enabled) if not set
    if (stored === null) {
      return true;
    }
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(reduceTransparency));
  }, [reduceTransparency, storageKey]);

  return {
    reduceTransparency,
    setReduceTransparency,
  };
}
