import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store/storeContext';
import { useSwipeToClose } from './hooks';
import { NavIcon, Plus } from './icons';
import s from './shell.module.css';

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className={s.stage}>
      <div className={s.frame}>{children}</div>
    </div>
  );
}

export function Loader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className={s.loader} role="status">
      <div className={s.spinner} />
      {label}
    </div>
  );
}

interface NavDef {
  to: string;
  label: string;
  d: string;
  also: string[];
}
const LEFT: NavDef[] = [
  { to: '/home', label: 'Accueil', d: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z', also: ['/suggestions'] },
  { to: '/fridge', label: 'Frigo', d: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 11h14M9 7v1M9 14v2', also: [] },
];
const RIGHT: NavDef[] = [
  { to: '/planning', label: 'Planning', d: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4', also: [] },
  { to: '/profile', label: 'Profil', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6', also: [] },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const item = (n: NavDef) => {
    const on = pathname === n.to || n.also.includes(pathname);
    return (
      <NavLink key={n.to} to={n.to} replace className={`${s.navItem} ${on ? s.navItemOn : ''}`} aria-current={on ? 'page' : undefined}>
        <NavIcon d={n.d} />
        {n.label}
      </NavLink>
    );
  };
  return (
    <nav className={s.nav} aria-label="Navigation principale">
      {LEFT.map(item)}
      <div className={s.fabWrap}>
        <button type="button" className={s.fab} aria-label="Ajouter une recette" onClick={() => navigate('/add', { replace: true })}>
          <Plus />
        </button>
      </div>
      {RIGHT.map(item)}
    </nav>
  );
}

export interface SheetItem {
  key: string;
  label: string;
  sub?: string;
  subColor?: string;
  /** Vignette à gauche du libellé (ex. photo de la recette). Décorative : le libellé reste le nom accessible. */
  media?: ReactNode;
  selected?: boolean;
  onPick: () => void;
}

export function BottomSheet({
  open,
  title,
  items,
  onClose,
  header,
}: {
  open: boolean;
  title: string;
  items: SheetItem[];
  onClose: () => void;
  /** Contenu fixe entre le titre et la liste (ex. choix de la semaine). */
  header?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useSwipeToClose(ref, scrimRef, open, onClose);
  useEffect(() => {
    if (!open) return;
    // preventScroll : la feuille est encore hors écran (translateY) au moment du focus ;
    // sans ça le navigateur fait défiler .frame pour la montrer et tout l'écran reste décalé.
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        ref={scrimRef}
        className={s.scrim}
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="sheet-scrim"
      />
      <div
        ref={ref}
        className={s.sheet}
        style={{ transform: `translateY(${open ? '0' : '110%'})`, visibility: open ? 'visible' : 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className={s.grabber} />
        <h2 className={s.sheetTitle}>{title}</h2>
        {header}
        <div className={s.sheetList} data-sheet-scroll>
          {items.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`${s.sheetItem} ${o.media ? s.sheetItemMedia : ''} ${o.selected ? s.sheetItemOn : ''}`}
              onClick={o.onPick}
            >
              {o.media}
              <span className={s.sheetItemLabel}>{o.label}</span>
              {o.sub && (
                <span className={s.sheetItemSub} style={o.subColor ? { color: o.subColor } : undefined}>
                  {o.sub}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export const TOAST_MS = 1800;

/** Affiche le dernier message du store pendant TOAST_MS. Région live pour les lecteurs d'écran. Mémoïsé : ignore la navigation. */
export const Toast = memo(function Toast() {
  const toast = useApp((st) => st.toast);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenId(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const visible = !!toast && hiddenId !== toast.id;
  return (
    <div className={s.toast} style={{ opacity: visible ? 1 : 0 }} role="status" aria-live="polite">
      {visible ? toast.text : ''}
    </div>
  );
});
