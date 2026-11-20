import { useCallback, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { RecipeImage } from './components/RecipeImage';
import { BottomNav, BottomSheet, Frame, Loader, Toast, type SheetItem } from './components/Shell';
import { WeekNav } from './components/WeekNav';
import { formatDayMedium, formatDayShort, lastPlannableWeek, toIsoDate, weekDates, weekStart, type IsoDate } from './domain/calendar';
import { matchPct, planKey } from './domain/logic';
import { MEALS } from './domain/types';
import { useApp } from './store/storeContext';
import { Button } from './ui';
import AddRecipe from './screens/AddRecipe';
import Auth from './screens/Auth';
import Cook from './screens/Cook';
import Detail from './screens/Detail';
import EditRecipe from './screens/EditRecipe';
import Fridge from './screens/Fridge';
import Home from './screens/Home';
import ImportRecipe from './screens/ImportRecipe';
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
        <Route path="/recipe/:id/edit" element={<EditRecipe />} />
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
  const { sheet, recipes, fridge, plan, closeSheet, openSheet, setPlanEntry, flash } = useApp(
    useShallow((st) => ({
      sheet: st.sheet,
      recipes: st.recipes,
      fridge: st.fridge,
      plan: st.plan,
      closeSheet: st.closeSheet,
      openSheet: st.openSheet,
      setPlanEntry: st.setPlanEntry,
      flash: st.flash,
    })),
  );
  const onClose = useCallback(() => closeSheet(), [closeSheet]);

  let title = '';
  let items: SheetItem[] = [];
  let header: ReactNode = null;

  if (sheet?.type === 'pick') {
    const { date, meal } = sheet;
    const sel = plan[planKey(date, meal)];
    title = `${formatDayMedium(date)} · ${MEALS[meal]}`;
    items = recipes.map((d) => ({
      key: d.id,
      label: d.name,
      sub: `${matchPct(d, fridge)}% frigo`,
      media: <RecipeImage recipe={d} size={44} />,
      selected: sel === d.id,
      onPick: () => void setPlanEntry(date, meal, d.id),
    }));
    if (sel) items.push({ key: 'remove', label: 'Retirer ce repas', onPick: () => void setPlanEntry(date, meal, null) });
  }

  if (sheet?.type === 'plan') {
    const { recipeId } = sheet;
    const recipe = recipes.find((r) => r.id === recipeId);
    const today = toIsoDate();
    const first = weekStart(today);
    const last = lastPlannableWeek(today);
    const week: IsoDate = sheet.week && sheet.week >= first && sheet.week <= last ? sheet.week : first;
    title = `Planifier ${recipe?.name ?? ''}`;
    header = <WeekNav week={week} min={first} max={last} onChange={(w) => openSheet({ type: 'plan', recipeId, week: w })} />;
    // Pas de créneau dans le passé : on planifie à partir d'aujourd'hui.
    for (const date of weekDates(week).filter((d) => d >= today))
      MEALS.forEach((mealName, meal) => {
        const current = plan[planKey(date, meal)];
        items.push({
          key: planKey(date, meal),
          label: `${formatDayShort(date)} · ${mealName}`,
          sub: current === recipeId ? 'déjà prévu' : current ? 'occupé' : 'libre',
          subColor: current && current !== recipeId ? '#8a5300' : 'var(--green-600)',
          selected: current === recipeId,
          onPick: () => {
            void setPlanEntry(date, meal, recipeId).then(
              (ok) => ok && flash(`Ajouté au planning · ${formatDayMedium(date).toLowerCase()} ${mealName.toLowerCase()}`),
            );
          },
        });
      });
  }

  return <BottomSheet open={!!sheet} title={title} header={header} items={items} onClose={onClose} />;
}
