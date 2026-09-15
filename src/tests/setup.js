import { vi } from 'vitest';
vi.mock('../data/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

if (typeof window.HTMLDialogElement === 'undefined') {
  window.HTMLDialogElement = window.HTMLElement;
}

window.HTMLDialogElement.prototype.showModal = vi.fn(function mock() {
  this.open = true;
});
window.HTMLDialogElement.prototype.close = vi.fn(function mock() {
  this.open = false;
});
