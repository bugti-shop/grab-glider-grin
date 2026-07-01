import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Dedicated path-based routes for Android home-screen widgets.
 * Native deep-linking sometimes drops query strings, so widgets target
 * clean paths here and we internally redirect to the canonical page
 * with the proper trigger query param.
 */
const useWidgetRedirect = (target: string) => {
  const navigate = useNavigate();
  useEffect(() => {
    // Fire immediately, and re-fire shortly after in case the router is
    // still initializing during cold-start from a widget tap.
    navigate(target, { replace: true });
    const t = window.setTimeout(() => navigate(target, { replace: true }), 120);
    return () => window.clearTimeout(t);
  }, [navigate, target]);
  // Visible fallback so users never see a blank screen if redirect is slow.
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'hsl(var(--background))',
      color: 'hsl(var(--muted-foreground))', fontSize: 14,
    }}>
      Opening…
    </div>
  );
};

export const WidgetAddTask = () => useWidgetRedirect("/todo/today?add=1&widget=1");
export const WidgetNewSticky = () => useWidgetRedirect("/notesdashboard?newNote=sticky&widget=1");
export const WidgetNewLined = () => useWidgetRedirect("/notesdashboard?newNote=lined&widget=1");
export const WidgetNewRegular = () => useWidgetRedirect("/notesdashboard?newNote=regular&widget=1");
export const WidgetNewSketch = () => useWidgetRedirect("/notesdashboard?newNote=sketch&widget=1");