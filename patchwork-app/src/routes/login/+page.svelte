<script lang="ts">
  import { goto } from '$app/navigation';
  import { getSupabase } from '$lib/services/supabase';

  let mode = $state<'signin' | 'signup'>('signin');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);

  let isSignUp = $derived(mode === 'signup');

  async function handleSubmit() {
    error = '';

    if (!email || !password) {
      error = 'Please fill in all fields.';
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      error = 'Passwords do not match.';
      return;
    }

    if (isSignUp && password.length < 6) {
      error = 'Password must be at least 6 characters.';
      return;
    }

    loading = true;

    try {
      const supabase = getSupabase();

      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
      }

      goto('/import');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred.';
      error = message;
    } finally {
      loading = false;
    }
  }

  function switchMode(newMode: 'signin' | 'signup') {
    mode = newMode;
    error = '';
    confirmPassword = '';
  }
</script>

<div class="flex h-screen items-center justify-center bg-paper">
  <div class="w-full max-w-sm">
    <h1 class="mb-6 text-center font-serif text-2xl font-bold text-ink">Patchwork</h1>

    <div class="card">
      <!-- Tab switcher -->
      <div class="mb-6 flex border-b border-paper-dark">
        <button
          class="mode-tab flex-1 {mode === 'signin' ? 'mode-tab-active border-b-2 border-accent' : 'mode-tab-inactive'}"
          onclick={() => switchMode('signin')}
        >
          Sign in
        </button>
        <button
          class="mode-tab flex-1 {mode === 'signup' ? 'mode-tab-active border-b-2 border-accent' : 'mode-tab-inactive'}"
          onclick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-ink-light mb-1">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            class="w-full rounded border border-paper-dark bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-ink-light mb-1">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            class="w-full rounded border border-paper-dark bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="••••••••"
          />
        </div>

        {#if isSignUp}
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-ink-light mb-1">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              bind:value={confirmPassword}
              class="w-full rounded border border-paper-dark bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>
        {/if}

        {#if error}
          <p class="text-sm text-red-600">{error}</p>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {#if loading}
            {isSignUp ? 'Creating account...' : 'Signing in...'}
          {:else}
            {isSignUp ? 'Create account' : 'Sign in'}
          {/if}
        </button>
      </form>
    </div>
  </div>
</div>
