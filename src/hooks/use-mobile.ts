import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/*
 * Starts `false` on both server and client — matching first-paint markup
 * exactly, same as WidgetVisibilityProvider's documented pattern — then
 * this effect syncs the real viewport width post-mount. Reading
 * `window.innerWidth` in the initial state (the old approach) made the
 * client's hydration pass diverge from the server-rendered markup
 * whenever the viewport was actually mobile-width, which is a real
 * hydration-mismatch bug, not just a lint nit.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
