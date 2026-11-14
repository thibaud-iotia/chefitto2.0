import { useNavigate } from 'react-router-dom';
import { DishImage } from '../components/DishImage';
import { useApp } from '../store/storeContext';
import { Button } from '../ui';
import s from './screens.module.css';

export function Logo() {
  return (
    <div className={s.logo}>
      <div className={s.logoMark} aria-hidden="true">
        C
      </div>
      <span className={s.logoText}>
        Chef<span>itto</span>
      </span>
    </div>
  );
}

export default function Splash() {
  const navigate = useNavigate();
  const setSplashSeen = useApp((st) => st.setSplashSeen);
  return (
    <main className={`theme-dark ${s.splash}`}>
      <Logo />
      <h1 className={s.splashTitle}>
        Cuisinez ce
        <br />
        qu'il y a déjà
        <br />
        dans <span className={s.ember}>votre frigo.</span>
      </h1>
      <div className={s.splashHero}>
        <DishImage size={290} className={s.splashPlate} style={{ width: 'auto', height: '100%', maxHeight: 290 }} eager />
      </div>
      <div className={s.splashFoot}>
        <Button
          size="lg"
          block
          onClick={() => {
            setSplashSeen();
            navigate('/auth');
          }}
        >
          Commencer
        </Button>
        <p className={s.splashNote}>Recettes, frigo, planning et suggestions au même endroit.</p>
      </div>
    </main>
  );
}
