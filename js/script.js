/* =====================================================
   ERP FINANCEIRO JW v6.5 - SCRIPT (NEUTRO)
   - NÃO executa automaticamente
   - Expõe helpers de UI: toast, modal, theme, files
   ===================================================== */

(function () {
  'use strict';

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    });
    children.forEach((c) => e.appendChild(c));
    return e;
  }

  function toast(message, type = 'success', ms = 3000) {
    const t = el('div', { class: `toast toast--${type}`, text: message });
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  function downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 50);
  }

  function pickFile(accept = '.json') {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept });
      input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  async function readFileText(file) {
    if (!file) return null;
    return await file.text();
  }

  // Theme: Auto / Light / Dark (persistência por usuário quando houver)
  const theme = {
    getKey() {
      const uid = window.Core?.user?.getCurrentUserId?.() || null;
      if (uid) return window.Core?.keys?.theme?.(uid) || `gf_erp_theme_${uid}`;
      return 'gf_erp_theme';
    },
    get() {
      return localStorage.getItem(theme.getKey()) || 'auto';
    },
    set(mode) {
      const m = (mode === 'light' || mode === 'dark' || mode === 'auto') ? mode : 'auto';
      localStorage.setItem(theme.getKey(), m);
      theme.apply();
      return m;
    },
    apply() {
      const m = theme.get();
      document.documentElement.dataset.theme = m; // auto|light|dark
    }
  };

  // Modal helpers (simples)
  const modal = {
    open(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.style.display = 'flex';
      m.classList.remove('hidden');
    },
    close(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.style.display = 'none';
      m.classList.add('hidden');
    }
  };

  window.ERP = { toast, files: { downloadText, pickFile, readFileText }, theme, modal };
})();
