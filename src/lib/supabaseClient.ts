import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://ffhmsxgqzmljpyyidfrz.supabase.co';
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VDV1Z0dzp61OWG22ZtZNeg_xhTWHFbx';

export const AUTH_REDIRECT = 'https://413x45h4w.github.io/homebook-prototype/';

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/** Pull a confirmation link's session in before the hash router rewrites the URL. */
export async function completeAuthRedirect(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const code = search.get('code');
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hash.includes('access_token=') ? hash.replace(/^\//, '') : '');
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  try {
    if (code) await supabase.auth.exchangeCodeForSession(code);
    else if (accessToken && refreshToken) await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    else return;
    const next = `${window.location.pathname}${window.location.search.replace(/([?&])code=[^&]*&?/, '$1').replace(/[?&]$/, '')}#/review`;
    window.history.replaceState({}, '', next);
  } catch {
    /* The email link can confirm the account even when this page cannot finish the session. */
  }
}
