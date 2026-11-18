import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/** Retour arrière ; si on est arrivé directement (lien, rafraîchissement), retombe sur `fallback`. */
export function useBack(fallback = '/home') {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}

/** Durée d'un appui long (ms) : celle d'Android / iOS. */
export const LONG_PRESS_MS = 500;
/** Au-delà de ce déplacement (px), c'est un défilement, pas un appui long. */
const MOVE_TOLERANCE = 10;

/**
 * Appui long (doigt, souris, stylet), plus le menu contextuel : clic droit, touche Menu / Maj+F10 du clavier,
 * appui long d'Android (qui émet `contextmenu`). Gestionnaires à poser sur l'élément.
 * Le clic qui suit le relâchement d'un appui long est annulé (phase de capture), pour ne pas ouvrir le lien dessous.
 */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => cancel, []);

  const fire = () => {
    cancel();
    fired.current = true;
    if (typeof navigator !== 'undefined') navigator.vibrate?.(15);
    onLongPress();
  };

  return {
    onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fire, ms);
    },
    onPointerMove(e: PointerEvent) {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      if (!fired.current) fire();
    },
    onClickCapture(e: MouseEvent) {
      // `detail === 0` : clic au clavier (Entrée / Espace), jamais la suite d'un appui long.
      if (!fired.current || e.detail === 0) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
