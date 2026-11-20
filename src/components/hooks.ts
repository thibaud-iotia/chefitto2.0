import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
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

/** Glissement vers le bas (px) au-delà duquel la feuille se ferme au relâchement. */
export const SWIPE_CLOSE_PX = 80;
/** Ou vitesse finale (px/ms) d'un coup de doigt rapide, même court. */
const SWIPE_CLOSE_SPEED = 0.5;
/** En deçà (px), c'est un appui : le clic n'est pas annulé. */
const TAP_SLOP = 10;

/**
 * Ferme une feuille du bas en la faisant glisser vers le bas au doigt (geste standard iOS / Android).
 * Depuis une zone qui défile (`data-sheet-scroll`), le geste ne tire la feuille que si la liste est tout en haut :
 * sinon c'est la liste qui défile. Écouteurs natifs non passifs : `preventDefault` empêche le rebond de la liste
 * pendant qu'on tire, et le clic sur l'élément sous le doigt à la fin d'un glissement.
 */
export function useSwipeToClose(
  sheet: RefObject<HTMLElement | null>,
  scrim: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const el = sheet.current;
    if (!el || !open) return;
    let g: { x0: number; y0: number; dy: number; armed: boolean; dragging: boolean; lastY: number; lastT: number; v: number } | null =
      null;

    const paint = (dy: number, animate: boolean) => {
      const bg = scrim.current;
      el.style.transition = animate ? '' : 'none';
      el.style.transform = `translateY(${dy > 0 ? `${dy}px` : '0'})`;
      if (bg) {
        bg.style.transition = animate ? '' : 'none';
        bg.style.opacity = String(Math.max(0, 1 - dy / Math.max(el.offsetHeight, 1)));
      }
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) {
        g = null;
        return;
      }
      const scroller = (e.target as Element | null)?.closest?.('[data-sheet-scroll]');
      g = { x0: t.clientX, y0: t.clientY, dy: 0, armed: !scroller || scroller.scrollTop <= 0, dragging: false, lastY: t.clientY, lastT: e.timeStamp, v: 0 };
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!g?.armed || !t) return;
      const dy = t.clientY - g.y0;
      const dx = t.clientX - g.x0;
      if (!g.dragging) {
        if (dy === 0 && dx === 0) return;
        // Vers le haut ou de côté : défilement normal, la feuille ne bouge pas pour tout ce geste.
        if (dy < 0 || Math.abs(dx) > dy) {
          g.armed = false;
          return;
        }
        g.dragging = true;
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (t.clientY - g.lastY) / dt;
      g.lastY = t.clientY;
      g.lastT = e.timeStamp;
      g.dy = Math.max(0, dy);
      paint(g.dy, false);
    };

    const onEnd = (e: TouchEvent) => {
      const cur = g;
      g = null;
      if (!cur?.dragging) return;
      if (cur.dy > TAP_SLOP && e.cancelable) e.preventDefault();
      if (cur.dy > SWIPE_CLOSE_PX || (cur.dy > TAP_SLOP && cur.v > SWIPE_CLOSE_SPEED)) {
        // Rend la main aux transitions CSS : la feuille finit sa course depuis la position du doigt.
        el.style.transition = '';
        if (scrim.current) scrim.current.style.transition = '';
        close.current();
      } else paint(0, true);
    };

    const onCancel = () => {
      if (g?.dragging) paint(0, true);
      g = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [sheet, scrim, open]);
}
