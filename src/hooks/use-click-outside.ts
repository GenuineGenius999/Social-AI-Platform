import { useEffect, type RefObject } from "react";

export function useClickOutside(refs: RefObject<HTMLElement | null>[], onOutside: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [refs, onOutside, enabled]);
}
