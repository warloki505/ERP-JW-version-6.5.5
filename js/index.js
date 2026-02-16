/* =====================================================
   ERP FINANCEIRO JW v6.5 - INDEX (LOGIN / CADASTRO)
   - Multiusuário por hash do e-mail
   - Define sessão: gf_erp_current_userId + gf_erp_logged
   - Dispara migração v4.x -> v6.5 se existir
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) {
      console.error('[Index] Core/ERP não carregados.');
      return;
    }

    // se já estiver logado, vai direto
    if (Core.user.isLogged()) {
      window.location.href = 'dashboard.html';
      return;
    }

    try { ERP.theme.apply(); } catch {}

    bind();
  }

  const $ = (id) => document.getElementById(id);
  const statusEl = () => $('status');

  function setStatus(msg, type = 'info') {
    const el = statusEl();
    if (!el) return;
    el.textContent = msg || '';
    el.className = `status status--${type}`;
  }

  async function hashPassword(password) {
    const hex = await Core.crypto.sha256Hex(String(password || ''));
    return hex;
  }

  async function createAccount(name, email, password) {
    const userId = await Core.user.hashEmail(email);
    const key = Core.keys.user(userId);

    const existing = Core.storage.getJSON(key, null);
    if (existing) return { ok: false, error: 'Já existe uma conta com esse e-mail.' };

    const user = {
      nome: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    };

    Core.storage.setJSON(key, user);
    return { ok: true, userId };
  }

  async function login(email, password) {
    const userId = await Core.user.hashEmail(email);
    const user = Core.storage.getJSON(Core.keys.user(userId), null);

    if (!user) return { ok: false, error: 'Conta não encontrada. Verifique o e-mail.' };

    const passHash = await hashPassword(password);
    if (passHash !== user.passwordHash) return { ok: false, error: 'Senha incorreta.' };

    localStorage.setItem(Core.user.SESSION.loggedKey, 'true');
    Core.user.setCurrentUserId(userId);
    return { ok: true, userId, user };
  }

  function bind() {
    const loginForm = $('login-form');
    const signupForm = $('signup-form');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Autenticando...', 'info');

        const email = $('login-email')?.value || '';
        const pass = $('login-password')?.value || '';

        try {
          const res = await login(email, pass);
          if (!res.ok) return setStatus(res.error, 'error');
          setStatus('Login OK. Redirecionando...', 'ok');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          setStatus('Erro ao autenticar. Tente novamente.', 'error');
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Criando conta...', 'info');

        const name = $('signup-name')?.value || '';
        const email = $('signup-email')?.value || '';
        const pass = $('signup-password')?.value || '';

        if (String(pass).length < 6) return setStatus('Senha deve ter no mínimo 6 caracteres.', 'error');

        try {
          const res = await createAccount(name, email, pass);
          if (!res.ok) return setStatus(res.error, 'error');

          // faz login automaticamente
          const logged = await login(email, pass);
          if (!logged.ok) return setStatus('Conta criada. Faça login.', 'ok');

          setStatus('Conta criada. Redirecionando...', 'ok');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          setStatus('Erro ao criar conta. Tente novamente.', 'error');
        }
      });
    }
  }

  boot();
})();
