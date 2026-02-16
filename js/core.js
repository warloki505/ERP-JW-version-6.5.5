/* =====================================================
   ERP FINANCEIRO JW v6.5 - CORE (FONTE ÚNICA)
   - Formatadores, mês, storage seguro, keys por usuário
   - Cálculos: resumo, taxas, saúde, score
   - Agrupamentos: por banco, faturas por cartão (heurística)
   - Migração v4.x -> v6.5 (namespacing multiusuário)
   ===================================================== */

(function () {
  'use strict';

  const Core = {};
  const APP = { version: '6.5.0', backupVersion: '1' };

  // -------------------------------
  // STORAGE (safe)
  // -------------------------------
  Core.storage = {
    safeGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return raw;
      } catch (e) {
        console.warn('[Core.storage] safeGet failed', key, e);
        return fallback;
      }
    },
    safeSet(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.warn('[Core.storage] safeSet failed', key, e);
        return false;
      }
    },
    getJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn('[Core.storage] getJSON failed', key, e);
        return fallback;
      }
    },
    setJSON(key, value) {
      return Core.storage.safeSet(key, JSON.stringify(value));
    }
  };

  // -------------------------------
  // FORMAT
  // -------------------------------
  Core.format = {
    brl(value) {
      return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    // aceita "R$ 1.234,56" / "1234,56" / "1234.56"
    parseBRL(str) {
      const s = String(str ?? '').trim();
      if (!s) return 0;
      const cleaned = s
        .replace(/\s/g, '')
        .replace(/^R\$\s*/i, '')
        .replace(/\./g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.-]/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
  };

  // -------------------------------
  // MONTH
  // -------------------------------
  Core.month = {
    getMonthId(date = new Date()) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    },
    getMonthLabel(monthId) {
      const [y, m] = String(monthId || '').split('-');
      if (!y || !m) return '';
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    },
    daysInMonth(monthId) {
      const [y, m] = String(monthId || '').split('-').map(Number);
      if (!y || !m) return 30;
      return new Date(y, m, 0).getDate();
    },
    clampDay(monthId, day) {
      const max = Core.month.daysInMonth(monthId);
      const d = Math.max(1, Math.min(max, Number(day) || 1));
      return String(d).padStart(2, '0');
    }
  };

  // -------------------------------
  // USER / SESSION
  // -------------------------------
  const SESSION = {
    loggedKey: 'gf_erp_logged',
    currentUserIdKey: 'gf_erp_current_userId',
    migratedFlag: 'gf_erp_migrated_v5_1'
  };

  function bytesToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(input) {
    const enc = new TextEncoder().encode(String(input ?? ''));
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return bytesToHex(hash);
  }

  Core.user = {
    SESSION,
    async hashEmail(email) {
      const hex = await sha256Hex(String(email || '').trim().toLowerCase());
      // truncado para UX, mas estável
      return hex.slice(0, 16);
    },
    getCurrentUserId() {
      return Core.storage.safeGet(SESSION.currentUserIdKey, null);
    },
    setCurrentUserId(userId) {
      Core.storage.safeSet(SESSION.currentUserIdKey, String(userId || ''));
    },
    clearSession() {
      localStorage.setItem(SESSION.loggedKey, 'false');
      localStorage.removeItem(SESSION.currentUserIdKey);
    },
    isLogged() {
      return localStorage.getItem(SESSION.loggedKey) === 'true' && !!Core.user.getCurrentUserId();
    }
  };

  // -------------------------------
  // KEYS (namespacing por usuário)
  // -------------------------------
  Core.keys = {
    user(userId) { return `gf_erp_user_${userId}`; },
    tx(userId, monthId) { return `gf_erp_tx_${userId}_${monthId}`; },
    recorr(userId) { return `gf_erp_recorr_${userId}`; },
    recorrApplied(userId, monthId) { return `gf_erp_recorr_applied_${userId}_${monthId}`; },
    selectedMonth(userId) { return `gf_erp_selected_month_${userId}`; },
    goals(userId) { return `gf_erp_goals_${userId}`; },
    theme(userId) { return `gf_erp_theme_${userId}`; },
    cfgCats(userId) { return `gf_erp_cfg_categorias_${userId}`; },
    cfgBanks(userId) { return `gf_erp_cfg_bancos_${userId}`; }
  };

  // -------------------------------
  // CALC
  // -------------------------------
  Core.calc = {
    summary(txList) {
      const list = Array.isArray(txList) ? txList : [];
      let renda = 0, poupanca = 0, essenciais = 0, livres = 0, dividas = 0;

      list.forEach((t) => {
        const v = Number(t?.valor) || 0;
        if (t?.tipo === 'receita') renda += v;
        if (t?.tipo === 'poupanca') poupanca += v;
        if (t?.tipo === 'divida') dividas += v;
        if (t?.tipo === 'despesa' && t?.subtipo === 'essencial') essenciais += v;
        if (t?.tipo === 'despesa' && t?.subtipo === 'livre') livres += v;
      });

      const saldo = renda - poupanca - essenciais - livres - dividas;
      return { renda, poupanca, essenciais, livres, dividas, saldo };
    },

    rates(summary) {
      const r = summary || {};
      const renda = Number(r.renda) || 0;

      if (renda <= 0) {
        return { poupanca: null, endividamento: null, essenciais: null, livres: null };
      }

      const pct = (x) => (Number(x) || 0) * 100 / renda;
      return {
        poupanca: pct(r.poupanca),
        endividamento: pct(r.dividas),
        essenciais: pct(r.essenciais),
        livres: pct(r.livres)
      };
    },

    health(summary, thresholds) {
      const t = thresholds || {};
      const rates = Core.calc.rates(summary);

      function statusFrom(value, rules, mode) {
        if (value === null || value === undefined) {
          return { rate: null, status: 'Sem dados', tone: 'info' };
        }

        // mode: 'highGood' (poupança) ou 'lowGood' (endividamento/essenciais)
        if (mode === 'highGood') {
          if (value >= (rules.excelente ?? 30)) return { rate: value, status: 'Excelente', tone: 'ok' };
          if (value >= (rules.otima ?? 20)) return { rate: value, status: 'Ótima', tone: 'ok' };
          if (value >= (rules.aceitavel ?? 10)) return { rate: value, status: 'Aceitável', tone: 'warn' };
          return { rate: value, status: 'Baixa', tone: 'error' };
        } else {
          // lowGood
          if (value <= (rules.saudavel ?? rules.ideal ?? 10)) return { rate: value, status: 'Saudável', tone: 'ok' };
          if (value <= (rules.atencao ?? rules.aceitavel ?? 20)) return { rate: value, status: 'Atenção', tone: 'warn' };
          if (value <= (rules.perigoso ?? rules.alto ?? 30)) return { rate: value, status: 'Perigoso', tone: 'error' };
          return { rate: value, status: 'Crítico', tone: 'error' };
        }
      }

      return {
        poupanca: statusFrom(rates.poupanca, t.poupanca || {}, 'highGood'),
        endividamento: statusFrom(rates.endividamento, t.endividamento || {}, 'lowGood'),
        essenciais: statusFrom(rates.essenciais, t.essenciais || {}, 'lowGood'),
        livres: rates.livres === null ? { rate: null, status: 'Sem dados', tone: 'info' } : { rate: rates.livres, status: 'OK', tone: 'info' }
      };
    },

    score(summary, thresholds, pesos) {
      // score simples 0..100: poupanca (alto melhor), endividamento (baixo melhor), essenciais (baixo melhor)
      const w = pesos || { poupanca: 40, endividamento: 30, essenciais: 30 };
      const sumW = (w.poupanca + w.endividamento + w.essenciais) || 100;
      const health = Core.calc.health(summary, thresholds);

      function points(healthItem, type) {
        if (!healthItem || healthItem.rate === null) return null;
        // map status
        const s = healthItem.status;
        if (type === 'poupanca') {
          if (s === 'Excelente') return 100;
          if (s === 'Ótima') return 85;
          if (s === 'Aceitável') return 65;
          return 35;
        } else {
          if (s === 'Saudável') return 100;
          if (s === 'Atenção') return 75;
          if (s === 'Perigoso') return 45;
          return 25;
        }
      }

      const p1 = points(health.poupanca, 'poupanca');
      const p2 = points(health.endividamento, 'endividamento');
      const p3 = points(health.essenciais, 'essenciais');

      if (p1 === null && p2 === null && p3 === null) return null;

      const safe = (v) => (v === null ? 0 : v);
      const score = (safe(p1) * w.poupanca + safe(p2) * w.endividamento + safe(p3) * w.essenciais) / sumW;
      return Math.round(score);
    },

    groupByBank(txList) {
      const list = Array.isArray(txList) ? txList : [];
      const map = {}; // bank => net
      list.forEach((t) => {
        const bank = String(t?.banco || '—');
        const v = Number(t?.valor) || 0;

        // entradas positivas: receita
        // saídas negativas: despesa/poupanca/divida
        let delta = 0;
        if (t?.tipo === 'receita') delta = +v;
        else delta = -v;

        map[bank] = (map[bank] || 0) + delta;
      });

      return Object.entries(map)
        .map(([bank, net]) => ({ bank, net }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    },

    cardBillsByBank(txList) {
      // heurística: dívidas pagas via "Cartão de Crédito" OU banco contém "Cartão"
      const list = Array.isArray(txList) ? txList : [];
      const map = {}; // bank => total divida
      list.forEach((t) => {
        if (t?.tipo !== 'divida') return;
        const bank = String(t?.banco || '—');
        map[bank] = (map[bank] || 0) + (Number(t?.valor) || 0);
      });

      return Object.entries(map)
        .map(([bank, total]) => ({ bank, total }))
        .sort((a, b) => b.total - a.total);
    }
  };

  // -------------------------------
  // TX LOAD/SAVE por usuário
  // -------------------------------
  Core.tx = {
    load(userId, monthId) {
      return Core.storage.getJSON(Core.keys.tx(userId, monthId), []);
    },
    save(userId, monthId, list) {
      return Core.storage.setJSON(Core.keys.tx(userId, monthId), Array.isArray(list) ? list : []);
    }
  };

  // -------------------------------
  // SELECTED MONTH
  // -------------------------------
  Core.selectedMonth = {
    get(userId) {
      return Core.storage.safeGet(Core.keys.selectedMonth(userId), null);
    },
    set(userId, monthId) {
      if (!monthId) return;
      Core.storage.safeSet(Core.keys.selectedMonth(userId), String(monthId));
    },
    clear(userId) {
      localStorage.removeItem(Core.keys.selectedMonth(userId));
    }
  };

  // -------------------------------
  // MIGRATION v4.x -> v6.5
  // -------------------------------
  Core.migrate = {
    async runOnce() {
      const already = localStorage.getItem(SESSION.migratedFlag) === 'true';
      if (already) return { migrated: false, reason: 'already' };

      // v4: usuário em gf_erp_user
      const legacyUser = Core.storage.getJSON('gf_erp_user', null);
      const legacyLogged = localStorage.getItem('gf_erp_logged') === 'true';

      // Se não há nada antigo, só marca flag
      const hasAnyLegacyTx = Object.keys(localStorage).some(k => /^gf_erp_tx_\d{4}-\d{2}$/.test(k));
      const hasLegacy = !!legacyUser || hasAnyLegacyTx;

      if (!hasLegacy) {
        localStorage.setItem(SESSION.migratedFlag, 'true');
        return { migrated: false, reason: 'no-legacy' };
      }

      // resolve userId
      let userId = 'default';
      if (legacyUser?.email) {
        try { userId = await Core.user.hashEmail(legacyUser.email); } catch { userId = 'default'; }
      }

      // migrar user
      if (legacyUser) {
        Core.storage.setJSON(Core.keys.user(userId), legacyUser);
        // mantém legacy por segurança (não remove)
      }

      // migrar TXs: gf_erp_tx_YYYY-MM -> gf_erp_tx_${userId}_YYYY-MM
      const keys = Object.keys(localStorage).filter(k => k.startsWith('gf_erp_tx_'));
      let migratedMonths = 0;

      keys.forEach((k) => {
        const m = k.replace('gf_erp_tx_', '');
        if (!/^\d{4}-\d{2}$/.test(m)) return;
        const newKey = Core.keys.tx(userId, m);
        if (localStorage.getItem(newKey) !== null) return; // não sobrescreve
        const raw = localStorage.getItem(k);
        if (raw !== null) {
          localStorage.setItem(newKey, raw);
          migratedMonths += 1;
        }
      });

      // configs antigas (globais) -> por usuário, se ainda não existirem
      const oldCats = localStorage.getItem('gf_erp_cfg_categorias');
      const oldBanks = localStorage.getItem('gf_erp_cfg_bancos');
      if (oldCats && localStorage.getItem(Core.keys.cfgCats(userId)) === null) localStorage.setItem(Core.keys.cfgCats(userId), oldCats);
      if (oldBanks && localStorage.getItem(Core.keys.cfgBanks(userId)) === null) localStorage.setItem(Core.keys.cfgBanks(userId), oldBanks);

      // recorrências antigas
      const oldRec = localStorage.getItem('gf_erp_recorrentes');
      if (oldRec && localStorage.getItem(Core.keys.recorr(userId)) === null) localStorage.setItem(Core.keys.recorr(userId), oldRec);

      // month applied antigo (sem user) não migra (não é crítico)

      // selected month antigo (global)
      const oldSel = localStorage.getItem('gf_erp_selected_month');
      if (oldSel && localStorage.getItem(Core.keys.selectedMonth(userId)) === null) localStorage.setItem(Core.keys.selectedMonth(userId), oldSel);

      // define sessão se estava logado
      if (legacyLogged) {
        localStorage.setItem(SESSION.loggedKey, 'true');
        Core.user.setCurrentUserId(userId);
      }

      localStorage.setItem(SESSION.migratedFlag, 'true');
      return { migrated: true, userId, migratedMonths };
    }
  };

  // -------------------------------
  // BACKUP / RESTORE
  // -------------------------------
  Core.backup = {
    collectUserKeys(userId) {
      const prefixes = [
        Core.keys.user(userId),
        `gf_erp_tx_${userId}_`,
        Core.keys.recorr(userId),
        `gf_erp_recorr_applied_${userId}_`,
        Core.keys.goals(userId),
        Core.keys.selectedMonth(userId),
        Core.keys.cfgCats(userId),
        Core.keys.cfgBanks(userId),
        Core.keys.theme(userId)
      ];

      const keys = Object.keys(localStorage).filter((k) => {
        return prefixes.some((p) => k === p || k.startsWith(p));
      });

      const out = {};
      keys.forEach((k) => {
        out[k] = localStorage.getItem(k);
      });
      return out;
    },

    buildPayload(userId) {
      return {
        backupVersion: APP.backupVersion,
        appVersion: APP.version,
        exportDateISO: new Date().toISOString(),
        userId,
        keys: Core.backup.collectUserKeys(userId)
      };
    },

    validatePayload(obj) {
      if (!obj || typeof obj !== 'object') return { ok: false, error: 'JSON inválido' };
      const req = ['backupVersion', 'appVersion', 'exportDateISO', 'userId', 'keys'];
      for (const k of req) {
        if (!(k in obj)) return { ok: false, error: `Campo obrigatório ausente: ${k}` };
      }
      if (!obj.keys || typeof obj.keys !== 'object') return { ok: false, error: 'keys inválido' };
      return { ok: true };
    },

    applyPayload(obj) {
      // escreve key a key (fail-safe: não limpa nada)
      const keys = obj.keys || {};
      const all = Object.keys(keys);
      all.forEach((k) => {
        localStorage.setItem(k, keys[k]);
      });
      return { applied: all.length };
    }
  };

  // -------------------------------
  // GUARDS
  // -------------------------------
  Core.guards = {
    requireLogin() {
      if (!Core.user.isLogged()) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    }
  };

  // expose
  Core.APP = APP;
  Core.crypto = { sha256Hex, bytesToHex };
  window.Core = Core;
})();
