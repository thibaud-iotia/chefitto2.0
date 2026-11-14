import { useCallback } from 'react';
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
