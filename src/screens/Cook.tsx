import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useBack } from '../components/hooks';
import { Close } from '../components/icons';
import { useApp } from '../store/storeContext';
import { Button, IconButton, ProgressBar } from '../ui';
import s from './screens.module.css';

/** Garde l'écran allumé pendant la cuisine (si le navigateur le permet). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);
}

export default function Cook() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useBack(`/recipe/${id}`);
  const recipe = useApp((st) => st.recipes.find((r) => r.id === id));
  const flash = useApp((st) => st.flash);
  const [step, setStep] = useState(0);
  useWakeLock();

  if (!recipe) return <Navigate to="/home" replace />;
  const total = recipe.steps.length;
  const last = step >= total - 1;

  return (
    <main className={`theme-dark ${s.cook}`}>
      <div className={s.cookTop}>
        <IconButton label="Quitter" onClick={back}>
          <Close />
        </IconButton>
        <ProgressBar value={((step + 1) / total) * 100} label="Progression de la recette" />
        <span className={s.cookCount}>
          {step + 1}/{total}
        </span>
      </div>
      <p className={s.cookStepNum}>ÉTAPE {step + 1}</p>
      <p className={s.cookText} aria-live="polite">
        {recipe.steps[Math.min(step, total - 1)]}
      </p>
      <p className={s.cookRecipe}>{recipe.name}</p>
      <div className={s.row}>
        <div style={{ flex: 1 }}>
          <Button variant="outline" size="lg" block disabled={step === 0} onClick={() => setStep((x) => Math.max(0, x - 1))}>
            Précédent
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button
            variant={last ? 'accent' : 'primary'}
            size="lg"
            block
            onClick={() => {
              if (last) {
                navigate('/home', { replace: true });
                flash('Bon appétit !');
              } else setStep((x) => x + 1);
            }}
          >
            {last ? 'Terminer' : 'Étape suivante'}
          </Button>
        </div>
      </div>
    </main>
  );
}
