import { useCallback } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BottomNav, BottomSheet, Frame, Loader, Toast, type SheetItem } from './components/Shell';
import { matchPct, planKey } from './domain/logic';
import { DAYS, MEALS } from './domain/types';
import { useApp } from './store/storeContext';
import { Button } from './ui';
import AddRecipe from './screens/AddRecipe';
import Auth from './screens/Auth';
import Cook from './screens/Cook';
import Detail from './screens/Detail';
import Fridge from './screens/Fridge';
import Home from './screens/Home';
import ImportRecipe from './screens/ImportRecipe';
import LyricsTest from './screens/LyricsTest';
import Planning from './screens/Planning';
import Profile from './screens/Profile';
import Splash from './screens/Splash';
import Suggestions from './screens/Suggestions';
import s from './screens/screens.module.css';

const NAV_ROUTES = ['/home', '/fridge', '/planning', '/profile', '/add', '/add/import', '/suggestions'];

export default function App({ demo = false }: { demo?: boolean }) {
  const { status, error, splashSeen, reload, signOut } = useApp(
    useShallow((st) => ({ status: st.status, error: st.error, splashSeen: st.splashSeen, reload: st.reload, signOut: st.signOut })),
  );
  const { pathname } = useLocation();

  // Page de test (paroles Genius / LRCLIB) : accessible connecté ou non, en dev / preview.
  if (pathname === '/test') return <Frame>{<LyricsTest />}</Frame>;

  if (status === 'booting') return <Frame>{<Loader />}</Frame>;

  if (status === 'anon') {
    return (
      <Frame>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/auth" element={<Auth demo={demo} />} />
          <Route path="*" element={<Navigate to={splashSeen ? '/auth' : '/'} replace />} />
        </Routes>
      </Frame>
    );
  }

  if (status === 'loading') return <Frame>{<Loader label="Chargement de vos recettes…" />}</Frame>;

  if (status === 'error') {
    return (
      <Frame>
        <main className={s.page} style={{ justifyContent: 'center' }}>
          <h1 className={s.title}>Oups.</h1>
          <p className={s.formError} role="alert">
            {error ?? 'Impossible de charger vos données.'}
          </p>
          <Button size="lg" block onClick={() => void reload()}>
            Réessayer
          </Button>
          <Button variant="ghost" block onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </main>
      </Frame>
    );
  }

  return (
    <Frame>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/recipe/:id" element={<Detail />} />
        <Route path="/recipe/:id/cook" element={<Cook />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/fridge" element={<Fridge />} />
        <Route path="/suggestions" element={<Suggestions />} />
        <Route path="/add" element={<AddRecipe />} />
        <Route path="/add/import" element={<ImportRecipe />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      {NAV_ROUTES.includes(pathname) && <BottomNav />}
      <SheetHost />
      <Toast />
    </Frame>
  );
}

/** Bottom sheet partagé : choix d'un plat pour un créneau, ou d'un créneau pour un plat. */
function SheetHost() {
  const { sheet, recipes, fridge, plan, closeSheet, setPlanEntry, flash } = useApp(
    useShallow((st) => ({
      sheet: st.sheet,
      recipes: st.recipes,
      fridge: st.fridge,
      plan: st.plan,
      closeSheet: st.closeSheet,
      setPlanEntry: st.setPlanEntry,
      flash: st.flash,
    })),
  );
  const onClose = useCallback(() => closeSheet(), [closeSheet]);

  let title = '';
  let items: SheetItem[] = [];

  if (sheet?.type === 'pick') {
    const { day, meal } = sheet;
    const sel = plan[planKey(day, meal)];
    title = `${DAYS[day]} · ${MEALS[meal]}`;
    items = recipes.map((d) => ({
      key: d.id,
      label: d.name,
      sub: `${matchPct(d, fridge)}% frigo`,
      selected: sel === d.id,
      onPick: () => void setPlanEntry(day, meal, d.id),
    }));
    if (sel) items.push({ key: 'remove', label: 'Retirer ce repas', onPick: () => void setPlanEntry(day, meal, null) });
  }

  if (sheet?.type === 'plan') {
    const recipe = recipes.find((r) => r.id === sheet.recipeId);
    title = `Planifier ${recipe?.name ?? ''}`;
    DAYS.forEach((dayName, day) =>
      MEALS.forEach((mealName, meal) => {
        const taken = !!plan[planKey(day, meal)];
        items.push({
          key: `${day}-${meal}`,
          label: `${dayName} · ${mealName}`,
          sub: taken ? 'occupé' : 'libre',
          subColor: taken ? '#8a5300' : 'var(--green-600)',
          onPick: () => {
            void setPlanEntry(day, meal, sheet.recipeId).then(() => flash('Ajouté au planning'));
          },
        });
      }),
    );
  }

  return <BottomSheet open={!!sheet} title={title} items={items} onClose={onClose} />;
}
