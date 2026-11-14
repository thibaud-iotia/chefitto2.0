import { useState, type FormEvent } from 'react';
import { validateAuth } from '../domain/logic';
import { useApp } from '../store/storeContext';
import { Button, Input, Tabs } from '../ui';
import s from './screens.module.css';

type Mode = 'login' | 'signup';

export default function Auth({ demo }: { demo: boolean }) {
  const signIn = useApp((st) => st.signIn);
  const signUp = useApp((st) => st.signUp);
  const resetPassword = useApp((st) => st.resetPassword);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const invalid = validateAuth(mode, { email, password, confirm });
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    if (isLogin) {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const res = await signUp(email, password);
      if (res.error) setError(res.error);
      else if (res.needsConfirm) setNotice('Compte créé ! Confirmez votre email via le lien reçu, puis connectez-vous.');
    }
    setBusy(false);
  }

  async function forgot() {
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Saisissez votre email pour recevoir le lien');
    setError(null);
    const err = await resetPassword(email);
    if (err) setError(err);
    else setNotice('Si un compte existe, un lien de réinitialisation vient d’être envoyé.');
  }

  return (
    <main className={`${s.page} ${s.auth}`}>
      <div className={s.logo}>
        <div className={s.authLogoMark} aria-hidden="true">
          C
        </div>
        <span className={s.authLogoText}>
          Chef<span>itto</span>
        </span>
      </div>
      <h1 className={s.authTitle}>{isLogin ? 'Content de vous revoir.' : 'Créez votre compte.'}</h1>
      <Tabs<Mode>
        label="Mode d'authentification"
        tabs={[
          { value: 'login', label: 'Connexion' },
          { value: 'signup', label: 'Inscription' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNotice(null);
        }}
      />
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="toto@cuisine.fr"
          size="lg"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          placeholder="••••••••"
          size="lg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {!isLogin && (
          <Input
            label="Confirmer le mot de passe"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            size="lg"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        {error && (
          <p className={s.formError} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={s.notice} role="status">
            {notice}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? 'Un instant…' : isLogin ? 'Me connecter' : "Je m'inscris"}
        </Button>
      </form>
      {isLogin && (
        <button type="button" className={s.linkBtn} onClick={forgot}>
          Mot de passe oublié ?
        </button>
      )}
      {demo && <p className={s.demo}>Mode démo : données stockées uniquement sur cet appareil.</p>}
    </main>
  );
}
