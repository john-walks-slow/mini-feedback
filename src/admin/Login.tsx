import { useState, type FormEvent } from 'react';
import { api, ApiError } from './api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" />
          <span>mini-feedback</span>
        </div>
        <h1>进入反馈台</h1>
        <p>开发态的反馈都收在这里。</p>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary login-submit" type="submit" disabled={busy || !password}>
          {busy ? '进入中…' : '进入'}
        </button>
      </form>
    </div>
  );
}
