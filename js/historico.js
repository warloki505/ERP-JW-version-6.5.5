/* =====================================================
   ERP FINANCEIRO JW v6.5 - HISTÓRICO
   - Lista meses do usuário atual (scan keys)
   - selected_month consistente (por usuário)
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Histórico] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}

    bind();
    loadHistorico();
  }

  const $ = (id) => document.getElementById(id);

  function getUserId() { return Core.user.getCurrentUserId(); }

  function monthKeys() {
    const uid = getUserId();
    const prefix = `gf_erp_tx_${uid}_`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.replace(prefix, ''))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => b.localeCompare(a));
  }

  function loadTx(monthId) {
    return Core.tx.load(getUserId(), monthId);
  }

  function openMonth(monthId, where) {
    Core.selectedMonth.set(getUserId(), monthId);
    window.location.href = where;
  }

  function renderMonthCard(monthId) {
    const tx = loadTx(monthId);
    const sum = Core.calc.summary(tx);

    const el = document.createElement('div');
    el.className = 'card';
    el.style.marginBottom = '14px';

    el.innerHTML = `
      <div class="card__header" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <h3 style="margin:0;">${Core.month.getMonthLabel(monthId)}</h3>
          <small class="text-muted">${tx.length} lançamentos</small>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn--ghost" data-open-dashboard="${monthId}">📌 Abrir</button>
          <button class="btn btn--ghost" data-open-charts="${monthId}">📈 Gráficos</button>
        </div>
      </div>

      <div class="kpi-grid" style="margin-top:12px;">
        <div class="kpi kpi--receita">
          <div class="kpi__title">Renda</div>
          <div class="kpi__value">${Core.format.brl(sum.renda)}</div>
        </div>
        <div class="kpi kpi--poupanca">
          <div class="kpi__title">Poupança</div>
          <div class="kpi__value">${Core.format.brl(sum.poupanca)}</div>
        </div>
        <div class="kpi kpi--despesa">
          <div class="kpi__title">Essenciais</div>
          <div class="kpi__value">${Core.format.brl(sum.essenciais)}</div>
        </div>
        <div class="kpi kpi--livre">
          <div class="kpi__title">Livres</div>
          <div class="kpi__value">${Core.format.brl(sum.livres)}</div>
        </div>
        <div class="kpi kpi--dividas">
          <div class="kpi__title">Dívidas</div>
          <div class="kpi__value">${Core.format.brl(sum.dividas)}</div>
        </div>
        <div class="kpi kpi--saldo">
          <div class="kpi__title">Saldo</div>
          <div class="kpi__value">${Core.format.brl(sum.saldo)}</div>
        </div>
      </div>
    `;

    el.addEventListener('click', (e) => {
      const btnDash = e.target.closest('[data-open-dashboard]');
      if (btnDash) return openMonth(btnDash.dataset.openDashboard, 'dashboard.html');

      const btnCharts = e.target.closest('[data-open-charts]');
      if (btnCharts) return openMonth(btnCharts.dataset.openCharts, 'charts.html');
    });

    return el;
  }

  function loadHistorico() {
    const list = $('monthsList');
    if (!list) return;

    const months = monthKeys();
    list.innerHTML = '';

    if (months.length === 0) {
      list.innerHTML = `
        <div class="card" style="text-align: center; padding: 60px;">
          <p class="text-muted">Nenhum mês encontrado ainda. Comece lançando dados no Dashboard.</p>
          <button class="btn btn--primary" onclick="window.location.href='dashboard.html'">Ir para Dashboard</button>
        </div>
      `;
      return;
    }

    months.forEach((m) => list.appendChild(renderMonthCard(m)));
  }

  function bind() {
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      if (confirm('Deseja realmente sair?')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });
  }

  boot();
})();
