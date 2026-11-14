import { useState } from 'react';
import { useBack } from '../components/hooks';
import { ChevronLeft, Search } from '../components/icons';
import { formatTime, normalize } from '../domain/logic';
import { IMPORT_TEMPLATES } from '../domain/seed';
import { useApp } from '../store/storeContext';
import { IconButton } from '../ui';
import { useRecipeForm } from './formStore';
import s from './screens.module.css';

export default function ImportRecipe() {
  const back = useBack('/add');
  const flash = useApp((st) => st.flash);
  const importTemplate = useRecipeForm((st) => st.importTemplate);
  const [q, setQ] = useState('');
  const list = IMPORT_TEMPLATES.filter((t) => !q.trim() || normalize(t.name).includes(normalize(q)));

  return (
    <main className={s.page}>
      <IconButton label="Retour" onClick={back}>
        <ChevronLeft />
      </IconButton>
      <h1 className={s.title}>Importer une recette</h1>
      <label className={s.searchBox}>
        <Search />
        <span className="sr-only">Rechercher un modèle</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" />
      </label>
      <ul className={s.list}>
        {list.map((t) => (
          <li key={t.name}>
            <button
              type="button"
              className={`${s.card} ${s.clickable} ${s.importItem}`}
              onClick={() => {
                importTemplate(t);
                back();
                flash('Recette importée');
              }}
            >
              <span className={s.sugName}>{t.name}</span>
              <span className={s.mono} style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                {formatTime(t.timeMin)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className={s.empty}>Aucun modèle ne correspond.</p>}
    </main>
  );
}
