import { useState, useEffect } from "react";

/**
 * Custom hook that detects the user's prefers-reduced-motion setting.
 *
 * Returns `true` when the user has enabled reduced motion in their OS/browser
 * settings, indicating that non-essential animations should be disabled or
 * replaced with instant transitions.
 *
 * @returns {boolean} Whether the user prefers reduced motion.
 *
 * @example
 * const prefersReducedMotion = useReducedMotion();
 * // Use to conditionally disable animations
 * <div className={prefersReducedMotion ? "" : "animate-pulse"} />
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handler = (event) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);

    return () => {
      mediaQuery.removeEventListener("change", handler);
    };
  }, []);

  return prefersReducedMotion;
}
