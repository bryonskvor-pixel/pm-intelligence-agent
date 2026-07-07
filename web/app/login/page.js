'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Login failed.');
        setSubmitting(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get('from') || '/';
    } catch {
      setError('Network error — try again.');
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 320 }}>
      <h1>PM Intelligence Agent</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem' }}
        />
        <button type="submit" disabled={submitting} style={{ width: '100%', padding: '0.5rem' }}>
          {submitting ? 'Checking...' : 'Sign in'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
