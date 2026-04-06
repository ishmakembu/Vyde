'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassButton } from '@/components/ui/GlassButton';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      const signInResult = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push('/directory');
        router.refresh();
      } else {
        setError('Account created but login failed');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[rgba(0,80,120,0.15)] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] bg-[rgba(80,0,120,0.12)] blur-[100px] rounded-full"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[400px]"
      >
        <div className="auth-card">
          <div className="text-center mb-8">
            <h1 className="logo mb-2">Vide</h1>
            <p className="text-[13px] text-[var(--text-secondary)]">Create your account</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">No email needed</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <GlassInput
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              disabled={isLoading}
              maxLength={20}
              autoComplete="username"
            />

            <GlassInput
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
            />

            <GlassInput
              placeholder="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              error={error}
            />

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              disabled={isLoading || !username || !password || !confirmPassword}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                'Join Vide'
              )}
            </GlassButton>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[13px] text-[var(--text-secondary)]">
              Already have an account?{' '}
              <Link href="/login" className="text-[var(--cyan)] hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}