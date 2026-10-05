import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { friendlyAuthError } from '../auth/authErrors';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans bg-slate-50">

      {/* Left panel - dark navy brand (desktop only) */}
      <div className="hidden md:flex w-80 bg-[#0B1120] flex-col justify-between p-8 lg:p-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Droplets className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="font-bold text-xl text-white tracking-tight leading-none">SWAMPDS</h1>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              Smart Water Monitoring &amp;<br />Pipeline Leak Detection
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-white font-semibold text-lg leading-snug">
              Real-time pipeline<br />monitoring &amp; control
            </h2>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Monitor three inline flow sensors and the tank level, and detect leaks between them automatically.
              Control the pump remotely in auto or manual mode.
            </p>
          </div>

          {/* LED status legend */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">System States</p>
            {[
              { color: 'bg-green-500',  label: 'Normal',  desc: 'All three flow sensors agree' },
              { color: 'bg-amber-500',  label: 'Warning', desc: 'Flow difference or pump issue' },
              { color: 'bg-orange-500', label: 'Leak',    desc: 'Flow drops between sensors - leak confirmed' },
              { color: 'bg-red-600',    label: 'Fault',   desc: 'Sensor fault - shutoff active' },
            ].map(({ color, label, desc }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${color} flex-shrink-0 ring-2 ring-white/10`} />
                <div>
                  <span className="text-xs font-semibold text-slate-300">{label}</span>
                  <span className="text-xs text-slate-500 ml-2">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} SWAMPDS Capstone Project
        </p>
      </div>

      {/* Right panel - sign-in form */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 my-auto">
        {/* Mobile brand header */}
        <div className="md:hidden flex items-center gap-2.5 mb-8">
          <Droplets className="w-8 h-8 text-blue-600" />
          <div>
            <span className="font-bold text-xl text-slate-800 tracking-tight leading-none block">SWAMPDS</span>
            <span className="text-[10px] text-slate-500">Smart Water &amp; Leak Monitoring</span>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Welcome back</h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-6 sm:mb-8">
            Sign in to access the control dashboard.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@swampds.local"
                className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-800 text-base sm:text-sm placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-800 text-base sm:text-sm placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-xs"
            >
              {loading && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-6 sm:mt-8 text-center leading-relaxed">
            Accounts are provisioned manually in the Firebase console.<br />
            Contact your project lead if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
