import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useBack } from '../components/hooks';
import { Close } from '../components/icons';
import { StepVideo } from '../components/StepVideo';
import { videoThumbnail, type StepVideo as Video } from '../data/stepVideos';
import type { Recipe } from '../domain/types';
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

/** Au-delà, l'étape s'affiche en plus petit pour laisser voir la vidéo sans défiler. */
const LONG_STEP_CHARS = 110;

/**
 * Vidéos des étapes : `'loading'` pendant la recherche (une requête pour toute la recette),
 * `null` si le service est indisponible (le mode cuisine reste utilisable sans vidéo).
 */
function useStepVideos(recipe: Pick<Recipe, 'name' | 'steps'> | undefined): (Video | null)[] | 'loading' | null {
  const finder = useApp((st) => st.videos);
  const name = recipe?.name;
  const steps = recipe?.steps;
  const [result, setResult] = useState<{ name?: string; steps?: string[]; videos: (Video | null)[] | null }>({ videos: null });
  useEffect(() => {
    if (name === undefined || !steps?.length) return;
    let alive = true;
    finder.find({ name, steps }).then(
      (videos) => alive && setResult({ name, steps, videos }),
      () => alive && setResult({ name, steps, videos: null }),
    );
    return () => {
      alive = false;
    };
  }, [finder, name, steps]);
  if (!steps?.length) return null;
  return result.name === name && result.steps === steps ? result.videos : 'loading';
}

export default function Cook() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useBack(`/recipe/${id}`);
  const recipe = useApp((st) => st.recipes.find((r) => r.id === id));
  const flash = useApp((st) => st.flash);
  const [step, setStep] = useState(0);
  useWakeLock();
  const videos = useStepVideos(recipe);
  const nextVideo = Array.isArray(videos) ? videos[step + 1] : null;
  // Miniature de l'étape suivante préchargée : elle s'affiche sans attendre au changement d'étape.
  useEffect(() => {
    if (nextVideo) new Image().src = videoThumbnail(nextVideo.id);
  }, [nextVideo]);

  if (!recipe) return <Navigate to="/home" replace />;
  const total = recipe.steps.length;
  const last = step >= total - 1;
  const current = Math.min(step, total - 1);
  const text = recipe.steps[current] ?? '';

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
      <div className={s.cookBody}>
        <p className={s.cookStepNum}>ÉTAPE {step + 1}</p>
        <p className={`${s.cookText} ${text.length > LONG_STEP_CHARS ? s.cookTextLong : ''}`} aria-live="polite">
          {text}
        </p>
        <StepVideo key={current} video={videos === 'loading' ? 'loading' : (videos?.[current] ?? null)} />
      </div>
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
