/* =====================================================
   ERP FINANCEIRO JW v6.5 - CONFIG HELPERS (NAMESPACE)
   - Configs por usuário (categorias/bancos) com fallback v4.x
   - Defaults vêm de ERP_CONST
   ===================================================== */

(function () {
  'use strict';

  if (!window.ERP_CONST) {
    console.error('[ERP] ERP_CONST não carregado. Verifique a ordem dos scripts.');
    return;
  }

  // Resolve userId (se houver sessão ativa)
  function getUserId() {
    try {
      return window.Core?.user?.getCurrentUserId?.() || null;
    } catch {
      return null;
    }
  }

  // Keys (v6.5 preferencial / v4.x fallback)
  function keyCats() {
    const uid = getUserId();
    if (uid) return `gf_erp_cfg_categorias_${uid}`;
    return 'gf_erp_cfg_categorias';
  }

  function keyBanks() {
    const uid = getUserId();
    if (uid) return `gf_erp_cfg_bancos_${uid}`;
    return 'gf_erp_cfg_bancos';
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[ERP] Falha ao ler JSON:', key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeLabel(s) {
    return String(s || '').trim();
  }

  // -------------------------------
  // CATEGORIAS
  // -------------------------------
  function buildDefaultCategoriesConfig() {
    const out = {};
    const base = window.ERP_CONST.categories;

    Object.keys(base).forEach((kind) => {
      out[kind] = base[kind].map((c) => ({
        id: c.id,
        originalLabel: c.label,
        label: c.label,
        active: true
      }));
    });

    return out;
  }

  function ensureCategoriesConfig() {
    const cfg = loadJSON(keyCats(), null);
    if (cfg && typeof cfg === 'object') return cfg;

    // fallback v4.x global (migração suave)
    const legacy = loadJSON('gf_erp_cfg_categorias', null);
    if (legacy && typeof legacy === 'object') {
      saveJSON(keyCats(), legacy);
      return legacy;
    }

    const fresh = buildDefaultCategoriesConfig();
    saveJSON(keyCats(), fresh);
    return fresh;
  }

  function getCategoryConfig(kind) {
    const cfg = ensureCategoriesConfig();
    return Array.isArray(cfg[kind]) ? cfg[kind] : [];
  }

  function setCategoryConfig(kind, items) {
    const cfg = ensureCategoriesConfig();
    cfg[kind] = items;
    saveJSON(keyCats(), cfg);
  }

  function getActiveCategoryLabels(kind) {
    return getCategoryConfig(kind)
      .filter((i) => i.active)
      .map((i) => i.label);
  }

  // -------------------------------
  // BANCOS
  // -------------------------------
  function buildDefaultBanksConfig() {
    const base = window.ERP_CONST.banksBase;
    const defaults = window.ERP_CONST.banksByTypeDefault;

    const makeType = (type) => {
      const activeSet = new Set((defaults[type] || []).map(normalizeLabel));
      return base.map((b) => {
        const label = b.label;
        return {
          id: b.id,
          originalLabel: label,
          label,
          active: activeSet.has(normalizeLabel(label))
        };
      });
    };

    return {
      receita: makeType('receita'),
      poupanca: makeType('poupanca'),
      despesa: makeType('despesa'),
      divida: makeType('divida')
    };
  }

  function ensureBanksConfig() {
    const cfg = loadJSON(keyBanks(), null);
    if (cfg && typeof cfg === 'object') return cfg;

    // fallback v4.x global (migração suave)
    const legacy = loadJSON('gf_erp_cfg_bancos', null);
    if (legacy && typeof legacy === 'object') {
      saveJSON(keyBanks(), legacy);
      return legacy;
    }

    const fresh = buildDefaultBanksConfig();
    saveJSON(keyBanks(), fresh);
    return fresh;
  }

  function getBankConfig(type) {
    const cfg = ensureBanksConfig();
    return Array.isArray(cfg[type]) ? cfg[type] : [];
  }

  function setBankConfig(type, items) {
    const cfg = ensureBanksConfig();
    cfg[type] = items;
    saveJSON(keyBanks(), cfg);
  }

  function getActiveBankLabels(type) {
    return getBankConfig(type)
      .filter((i) => i.active)
      .map((i) => i.label);
  }

  // -------------------------------
  // UTIL: injeção temporária em selects
  // -------------------------------
  function ensureValueInList(list, value) {
    const v = normalizeLabel(value);
    if (!v) return list.slice();
    const exists = list.some((x) => normalizeLabel(x) === v);
    if (exists) return list.slice();
    return [value, ...list];
  }

  
  // -------------------------------
  // TOGGLES (v6.5)
  // - Ativa/desativa item sem recarregar a página
  // - Mantém compatibilidade com setCategoryConfig / setBankConfig
  // -------------------------------
  function toggleCategory(kind, idOrLabel) {
    const items = getCategoryConfig(kind).map((it) => {
      if (String(it.id) === String(idOrLabel) || normalizeLabel(it.label) === normalizeLabel(idOrLabel)) {
        return { ...it, active: !it.active };
      }
      return it;
    });
    setCategoryConfig(kind, items);
    return items;
  }

  function toggleBank(type, idOrLabel) {
    const items = getBankConfig(type).map((it) => {
      if (String(it.id) === String(idOrLabel) || normalizeLabel(it.label) === normalizeLabel(idOrLabel)) {
        return { ...it, active: !it.active };
      }
      return it;
    });
    setBankConfig(type, items);
    return items;
  }

  // Aliases (para gerenciadores dinâmicos)
  function getCategoriesByKind(kind) { return getCategoryConfig(kind); }
  function getBanksByType(type) { return getBankConfig(type); }

window.ERP_CFG = {
    // categories
    ensureCategoriesConfig,
    getCategoryConfig,
    setCategoryConfig,
    getActiveCategoryLabels,
    toggleCategory,
    getCategoriesByKind,

    // banks
    ensureBanksConfig,
    getBankConfig,
    setBankConfig,
    getActiveBankLabels,
    toggleBank,
    getBanksByType,

    // util
    ensureValueInList,
    normalizeLabel
  };
})();
