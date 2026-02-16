/* =====================================================
   ERP FINANCEIRO JW v6.5 - DASHBOARD (MULTIUSUÁRIO)
   - CRUD + navegação de meses + modais + recorrências
   - Cálculo centralizado no Core.calc.summary
   - selected_month consistente por usuário
   ===================================================== */

(function () {
  'use strict';

  // Guard + migração
  async function boot() {
    try {
      if (window.Core?.migrate) await Core.migrate.runOnce();
    } catch (e) {
      console.warn('[Dashboard] Migração falhou (seguindo):', e);
    }

    if (!window.Core || !window.ERP_CFG || !window.ERP) {
      console.error('[Dashboard] Scripts base não carregados (Core/ERP_CFG/ERP).');
      return;
    }

    if (!Core.guards.requireLogin()) return;

    // garantir configs (por usuário)
    ERP_CFG.ensureCategoriesConfig();
    ERP_CFG.ensureBanksConfig();

    init();
  }

  const $ = (id) => document.getElementById(id);

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  }

  function setOptions(select, list) {
    if (!select) return;

    // preserva seleção atual (se existir)
    const current = String(select.value ?? '');

    // preserva placeholder se o primeiro option tiver value vazio
    const hadPlaceholder = select.options.length && select.options[0].value === '';

    select.innerHTML = '';
    if (hadPlaceholder) {
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Selecione';
      select.appendChild(opt0);
    } else {
      // placeholder padrão
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Selecione';
      select.appendChild(opt0);
    }

    (list || []).forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });

    if (current) {
      ensureSelectedOption(select, current);
      select.value = current;
    }
  }


  function ensureSelectedOption(select, value) {
    if (!select) return;
    const v = ERP_CFG.normalizeLabel(value);
    if (!v) return;

    const exists = Array.from(select.options).some((o) => ERP_CFG.normalizeLabel(o.value) === v);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = `${value} (valor antigo)`;
      select.insertBefore(opt, select.firstChild?.nextSibling || null);
    }
    select.value = value;
  }

  // -------------------------------
  // USER + MONTH CONTEXT
  // -------------------------------
  const userId = () => Core.user.getCurrentUserId();

  function activeMonthDefault() {
    const uid = userId();
    const sel = uid ? Core.selectedMonth.get(uid) : null;
    return sel || Core.month.getMonthId(new Date());
  }

  let activeMonth = activeMonthDefault();

  function getTxKey(monthId = activeMonth) {
    return Core.keys.tx(userId(), monthId);
  }

  function loadTx(monthId = activeMonth) {
    return Core.storage.getJSON(getTxKey(monthId), []);
  }

  function saveTx(list, monthId = activeMonth) {
    return Core.storage.setJSON(getTxKey(monthId), Array.isArray(list) ? list : []);
  }

  let tx = [];

  // -------------------------------
  // RECORRÊNCIA (LANÇAMENTOS FIXOS)
  // -------------------------------
  function recKey() { return Core.keys.recorr(userId()); }
  function recAppliedKey(monthId) { return Core.keys.recorrApplied(userId(), monthId); }

  function loadRecorrentes() {
    return Core.storage.getJSON(recKey(), []);
  }

  function saveRecorrentes(list) {
    return Core.storage.setJSON(recKey(), Array.isArray(list) ? list : []);
  }

  function wasAppliedThisMonth(monthId, recId) {
    const map = Core.storage.getJSON(recAppliedKey(monthId), {});
    return map?.[recId] === true;
  }

  function markAppliedThisMonth(monthId, recId) {
    const map = Core.storage.getJSON(recAppliedKey(monthId), {});
    map[recId] = true;
    Core.storage.setJSON(recAppliedKey(monthId), map);
  }

  function monthInRange(monthId, startMonth, endMonth) {
    if (startMonth && monthId < startMonth) return false;
    if (endMonth && monthId > endMonth) return false;
    return true;
  }

  function applyRecorrentesForMonth(monthId) {
    const recs = loadRecorrentes();
    if (!Array.isArray(recs) || recs.length === 0) return false;

    let changed = false;
    let monthTx = loadTx(monthId);

    recs.forEach((rec) => {
      if (!rec || !rec.id || !rec.template) return;
      if (!monthInRange(monthId, rec.startMonth, rec.endMonth || null)) return;
      if (wasAppliedThisMonth(monthId, rec.id)) return;

      const t = rec.template;
      const day = Core.month.clampDay(monthId, t.day || 1);
      const data = `${monthId}-${day}`;

      monthTx.push({
        id: uid(),
        tipo: t.tipo,
        subtipo: t.subtipo || undefined,
        data,
        valor: t.valor,
        categoria: t.categoria,
        banco: t.banco,
        descricao: t.descricao || '',
        auto: true,
        recurrenceId: rec.id
      });

      markAppliedThisMonth(monthId, rec.id);
      changed = true;
    });

    if (changed) saveTx(monthTx, monthId);
    return changed;
  }

  // -------------------------------
  // LISTAS (configuráveis)
  // -------------------------------
  function catKindFromTx(item) {
    if (item.tipo === 'receita') return 'receita';
    if (item.tipo === 'poupanca') return 'poupanca';
    if (item.tipo === 'divida') return 'divida';
    if (item.tipo === 'despesa') {
      return item.subtipo === 'essencial' ? 'despesa_essencial' : 'despesa_livre';
    }
    return 'receita';
  }

  function bankTypeFromTx(item) {
    if (item.tipo === 'receita') return 'receita';
    if (item.tipo === 'poupanca') return 'poupanca';
    if (item.tipo === 'divida') return 'divida';
    return 'despesa';
  }

  function getActiveCategories(kind) {
    return ERP_CFG.getActiveCategoryLabels(kind);
  }

  function getActiveBanks(type) {
    return ERP_CFG.getActiveBankLabels(type);
  }

  // -------------------------------
  // UI ELEMENTS
  // -------------------------------
  const kpiRenda = $('kpiRenda');
  const kpiPoupanca = $('kpiPoupanca');
  const kpiEssenciais = $('kpiEssenciais');
  const kpiLivres = $('kpiLivres');
  const kpiDividas = $('kpiDividas');
  const kpiSaldo = $('kpiSaldoDistribuir');

  const monthLabel = $('monthLabel');
  const btnPrevMonth = $('btnPrevMonth');
  const btnCurrentMonth = $('btnCurrentMonth');
  const btnNextMonth = $('btnNextMonth');

  const btnPerfil = $('btnPerfil');
  const btnHistorico = $('btnHistorico');
  const btnCharts = $('btnCharts');
  const btnConsolidado = $('btnConsolidado');
  const btnMetas = $('btnMetas');

  const btnLimparMes = $('btnLimparMes');
  const logoutBtn = $('logoutBtn');

  const tbody = $('txTbody');

  const formPoupanca = $('formPoupanca');
  const formReceita = $('formReceita');
  const formDespesa = $('formDespesa');
  const formDivida = $('formDivida');

  const despesaSubtipo = $('despesaSubtipo');
  const despesaCategoria = $('despesaCategoria');

  const modalEdit = $('modalEdit');
  const modalFixar = $('modalFixar');

  // Saúde (se existir no HTML)
  const healthPoup = $('healthPoupanca');
  const healthEnd = $('healthEndividamento');
  const healthEss = $('healthEssenciais');
  const healthScore = $('healthScore');

  function toneClass(tone) {
    if (tone === 'ok') return 'status--ok';
    if (tone === 'warn') return 'status--info';
    if (tone === 'error') return 'status--error';
    return 'status--info';
  }

  // -------------------------------
  // RENDER
  // -------------------------------
  function render() {
    if (monthLabel) monthLabel.textContent = Core.month.getMonthLabel(activeMonth);

    const sum = Core.calc.summary(tx);

    if (kpiRenda) kpiRenda.textContent = Core.format.brl(sum.renda);
    if (kpiPoupanca) kpiPoupanca.textContent = Core.format.brl(sum.poupanca);
    if (kpiEssenciais) kpiEssenciais.textContent = Core.format.brl(sum.essenciais);
    if (kpiLivres) kpiLivres.textContent = Core.format.brl(sum.livres);
    if (kpiDividas) kpiDividas.textContent = Core.format.brl(sum.dividas);
    if (kpiSaldo) kpiSaldo.textContent = Core.format.brl(sum.saldo);

    if (kpiSaldo) {
      if (sum.saldo < 0) kpiSaldo.style.color = '#ef4444';
      else if (sum.saldo > 0) kpiSaldo.style.color = '#10b981';
      else kpiSaldo.style.color = '';
    }

    // Saúde/score
    if (window.ERP_CONST?.thresholds) {
      const health = Core.calc.health(sum, ERP_CONST.thresholds);
      const score = Core.calc.score(sum, ERP_CONST.thresholds, { poupanca: 40, endividamento: 30, essenciais: 30 });

      if (healthPoup) {
        healthPoup.className = `status ${toneClass(health.poupanca.tone)}`;
        healthPoup.textContent = `Poupança: ${health.poupanca.status} ${health.poupanca.rate == null ? '' : `(${health.poupanca.rate.toFixed(1)}%)`}`;
      }
      if (healthEnd) {
        healthEnd.className = `status ${toneClass(health.endividamento.tone)}`;
        healthEnd.textContent = `Endividamento: ${health.endividamento.status} ${health.endividamento.rate == null ? '' : `(${health.endividamento.rate.toFixed(1)}%)`}`;
      }
      if (healthEss) {
        healthEss.className = `status ${toneClass(health.essenciais.tone)}`;
        healthEss.textContent = `Essenciais: ${health.essenciais.status} ${health.essenciais.rate == null ? '' : `(${health.essenciais.rate.toFixed(1)}%)`}`;
      }
      if (healthScore) {
        healthScore.className = `status ${score == null ? 'status--info' : (score >= 80 ? 'status--ok' : score >= 60 ? 'status--info' : 'status--error')}`;
        healthScore.textContent = `Score do mês: ${score == null ? '—' : `${score}/100`}`;
      }
    }

    // Tabela
    if (!tbody) return;

    tbody.innerHTML = '';
    if (tx.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px;">
            <span class="text-muted">Nenhum lançamento neste mês</span>
          </td>
        </tr>
      `;
      return;
    }

    tx.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).forEach((t) => {
      const tr = document.createElement('tr');

      let badgeClass = 'badge-receita';
      let badgeText = 'RECEITA';

      if (t.tipo === 'poupanca') { badgeClass = 'badge-poupanca'; badgeText = 'POUPANÇA'; }
      else if (t.tipo === 'divida') { badgeClass = 'badge-divida'; badgeText = 'DÍVIDA'; }
      else if (t.tipo === 'despesa') {
        badgeClass = 'badge-despesa';
        badgeText = t.subtipo === 'essencial' ? 'DESP. ESSENCIAL' : 'DESP. LIVRE';
      }

      const pin = t.auto ? `<span class="pin-mark" title="Lançamento fixo aplicado automaticamente">📌</span>` : '';

      tr.innerHTML = `
        <td><span class="badge ${badgeClass}">${badgeText}</span> ${pin}</td>
        <td>${new Date(String(t.data) + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td style="font-weight: 600;">${Core.format.brl(t.valor)}</td>
        <td>${t.categoria || '—'}</td>
        <td>${t.banco || '—'}</td>
        <td class="text-muted">${t.descricao || '-'}</td>
        <td class="td-actions">
          <button class="btn-mini btn-pin" data-id="${t.id}" title="Fixar lançamento">📌</button>
          <button class="btn-mini btn-edit" data-id="${t.id}">✏️ Editar</button>
          <button class="btn-mini btn-del" data-id="${t.id}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function addTx(data) {
    tx.push({ id: uid(), ...data });
    saveTx(tx);
    render();
  }

  function validarValor(valor) {
    const v = parseFloat(valor);
    if (Number.isNaN(v) || v <= 0) {
      ERP.toast('Valor deve ser maior que zero!', 'error');
      return false;
    }
    return true;
  }

  // -------------------------------
  // MODAL EDIT
  // -------------------------------
  let editingId = null;

  function openEditModal(id) {
    const item = tx.find((t) => t.id === id);
    if (!item) return;

    editingId = id;

    $('editId').value = id;
    $('editTipo').value = item.tipo;
    $('editData').value = item.data;
    $('editValor').value = item.valor;
    $('editDescricao').value = item.descricao || '';

    const catKind = catKindFromTx(item);
    const bankType = bankTypeFromTx(item);

    const cats = ERP_CFG.ensureValueInList(getActiveCategories(catKind), item.categoria);
    const banks = ERP_CFG.ensureValueInList(getActiveBanks(bankType), item.banco);

    setOptions($('editCategoria'), cats);
    setOptions($('editBanco'), banks);

    ensureSelectedOption($('editCategoria'), item.categoria);
    ensureSelectedOption($('editBanco'), item.banco);

    if (modalEdit) {
      modalEdit.style.display = 'flex';
      modalEdit.classList.remove('hidden');
    }
  }

  window.closeEditModal = function () {
    if (!modalEdit) return;
    modalEdit.style.display = 'none';
    modalEdit.classList.add('hidden');
    editingId = null;
  };

  window.saveEdit = function () {
    if (!editingId) return;

    const item = tx.find((t) => t.id === editingId);
    if (!item) return;

    const valor = $('editValor').value;
    if (!validarValor(valor)) return;

    item.data = $('editData').value;
    item.valor = valor;
    item.categoria = $('editCategoria').value;
    item.banco = $('editBanco').value;
    item.descricao = $('editDescricao').value.trim();

    saveTx(tx);
    render();
    window.closeEditModal();
    ERP.toast('✓ Lançamento atualizado!', 'success');
  };

  // -------------------------------
  // DELETE
  // -------------------------------
  function deleteTx(id) {
    if (!confirm('⚠️ Confirmar exclusão deste lançamento?')) return;
    tx = tx.filter((t) => t.id !== id);
    saveTx(tx);
    render();
    ERP.toast('✓ Lançamento removido!', 'info');
  }

  // -------------------------------
  // FIXAR (RECORRÊNCIA)
  // -------------------------------
  let pinningId = null;

  function openFixarModal(id) {
    const item = tx.find((t) => t.id === id);
    if (!item) return;

    pinningId = id;

    $('fixResumo').textContent = `${item.tipo.toUpperCase()} • ${Core.format.brl(item.valor)} • ${item.categoria} • ${item.banco}`;
    $('fixInicio').value = activeMonth;

    const [y, m] = activeMonth.split('-').map(Number);
    const end = new Date(y, m - 1);
    end.setMonth(end.getMonth() + 11);
    $('fixFim').value = Core.month.getMonthId(end);

    $('fixSemFim').checked = false;
    $('fixAplicarAtual').checked = true;

    if (modalFixar) {
      modalFixar.style.display = 'flex';
      modalFixar.classList.remove('hidden');
    }
  }

  window.closeFixarModal = function () {
    if (!modalFixar) return;
    modalFixar.style.display = 'none';
    modalFixar.classList.add('hidden');
    pinningId = null;
  };

  function buildRecTemplateFromTx(item) {
    const day = (item.data || '').split('-')[2] || '01';
    return {
      tipo: item.tipo,
      subtipo: item.subtipo || undefined,
      day,
      valor: item.valor,
      categoria: item.categoria,
      banco: item.banco,
      descricao: item.descricao || ''
    };
  }

  window.saveFixar = function () {
    if (!pinningId) return;

    const item = tx.find((t) => t.id === pinningId);
    if (!item) return;

    const startMonth = $('fixInicio').value;
    const semFim = $('fixSemFim').checked;
    const endMonth = semFim ? null : $('fixFim').value;

    if (!startMonth) return ERP.toast('Informe o mês de início.', 'error');
    if (!semFim && endMonth && endMonth < startMonth) return ERP.toast('Mês final deve ser maior ou igual ao inicial.', 'error');

    const recs = loadRecorrentes();
    const rec = {
      id: uid(),
      createdAt: new Date().toISOString(),
      startMonth,
      endMonth,
      template: buildRecTemplateFromTx(item)
    };

    recs.push(rec);
    saveRecorrentes(recs);

    const applyNow = $('fixAplicarAtual').checked;
    if (applyNow && monthInRange(activeMonth, startMonth, endMonth)) {
      if (!wasAppliedThisMonth(activeMonth, rec.id)) {
        markAppliedThisMonth(activeMonth, rec.id);

        const t = rec.template;
        const day = Core.month.clampDay(activeMonth, t.day || 1);
        tx.push({
          id: uid(),
          tipo: t.tipo,
          subtipo: t.subtipo || undefined,
          data: `${activeMonth}-${day}`,
          valor: t.valor,
          categoria: t.categoria,
          banco: t.banco,
          descricao: t.descricao || '',
          auto: true,
          recurrenceId: rec.id
        });
        saveTx(tx);
        render();
      }
    }

    window.closeFixarModal();
    ERP.toast('📌 Lançamento fixo criado!', 'success');
  };

  // -------------------------------
  // NAV MONTH
  // -------------------------------
  function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    if ($('receitaData')) $('receitaData').value = today;
    if ($('poupancaData')) $('poupancaData').value = today;
    if ($('despesaData')) $('despesaData').value = today;
    if ($('dividaData')) $('dividaData').value = today;
  }

  function loadMonth(monthId) {
    applyRecorrentesForMonth(monthId);
    tx = loadTx(monthId);
    activeMonth = monthId;

    // persiste selected_month por usuário
    Core.selectedMonth.set(userId(), activeMonth);

    setDefaultDates();
    render();
  }

  // -------------------------------
  // INIT
  // -------------------------------
  function init() {
    // theme apply (não executa sozinho)
    try { ERP.theme.apply(); } catch {}

    // user name
    const userName = $('userName');
    const user = Core.storage.getJSON(Core.keys.user(userId()), null);
    if (user?.nome && userName) userName.textContent = `Olá, ${String(user.nome).split(' ')[0]}`;

    // binds
    if (btnPrevMonth) btnPrevMonth.addEventListener('click', () => {
      const [y, m] = activeMonth.split('-').map(Number);
      loadMonth(Core.month.getMonthId(new Date(y, m - 2, 1)));
    });

    if (btnNextMonth) btnNextMonth.addEventListener('click', () => {
      const [y, m] = activeMonth.split('-').map(Number);
      loadMonth(Core.month.getMonthId(new Date(y, m, 1)));
    });

    if (btnCurrentMonth) btnCurrentMonth.addEventListener('click', () => {
      Core.selectedMonth.clear(userId());
      loadMonth(Core.month.getMonthId(new Date()));
    });

    if (btnPerfil) btnPerfil.addEventListener('click', () => window.location.href = 'perfil.html');
    if (btnHistorico) btnHistorico.addEventListener('click', () => window.location.href = 'historico.html');
    if (btnCharts) btnCharts.addEventListener('click', () => window.location.href = 'charts.html');
    if (btnConsolidado) btnConsolidado.addEventListener('click', () => window.location.href = 'consolidado.html');
    if (btnMetas) btnMetas.addEventListener('click', () => window.location.href = 'metas.html');

    if (btnLimparMes) btnLimparMes.addEventListener('click', () => {
      if (!confirm(`⚠️ ATENÇÃO!\n\nIsso vai apagar TODOS os lançamentos de ${Core.month.getMonthLabel(activeMonth)}.\n\nEsta ação não pode ser desfeita. Confirmar?`)) return;
      tx = [];
      saveTx(tx);
      render();
      ERP.toast('✓ Todos os dados do mês foram removidos!', 'info');
    });

    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      if (confirm('Deseja realmente sair?')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });

    // forms
    if (formPoupanca) formPoupanca.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'poupanca',
        data: f.data.value,
        valor: f.valor.value,
        categoria: f.categoria.value,
        banco: f.banco.value,
        descricao: ($('poupancaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('✓ Poupança adicionada!', 'success');
      setDefaultDates();
    });

    if (formReceita) formReceita.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'receita',
        data: f.data.value,
        valor: f.valor.value,
        categoria: f.categoria.value,
        banco: f.banco.value,
        descricao: ($('receitaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('✓ Receita adicionada!', 'success');
      setDefaultDates();
    });

    if (formDespesa) formDespesa.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'despesa',
        subtipo: despesaSubtipo?.value,
        data: f.data.value,
        valor: f.valor.value,
        categoria: despesaCategoria?.value,
        banco: $('despesaBanco')?.value,
        descricao: ($('despesaDescricao')?.value || '').trim()
      });

      f.reset();
      if (despesaSubtipo) despesaSubtipo.value = '';
      if (despesaCategoria) despesaCategoria.innerHTML = `<option value="">Selecione tipo primeiro</option>`;
      ERP.toast('✓ Despesa adicionada!', 'success');
      setDefaultDates();
    });

    if (formDivida) formDivida.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'divida',
        data: f.data.value,
        valor: f.valor.value,
        categoria: $('dividaCategoria')?.value,
        banco: $('dividaBanco')?.value,
        descricao: ($('dividaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('⚠️ Dívida registrada. Priorize quitação!', 'error', 3500);
      setDefaultDates();
    });

    // selects (v6.5)
    function refreshFormSelects() {
      setOptions($('poupancaCategoria'), getActiveCategories('poupanca'));
      setOptions($('poupancaBanco'), getActiveBanks('poupanca'));

      setOptions($('receitaCategoria'), getActiveCategories('receita'));
      setOptions($('receitaBanco'), getActiveBanks('receita'));

      setOptions($('despesaBanco'), getActiveBanks('despesa'));

      setOptions($('dividaCategoria'), getActiveCategories('divida'));
      setOptions($('dividaBanco'), getActiveBanks('divida'));
    }

    refreshFormSelects();

    // Atualiza selects quando categorias/bancos mudarem no Perfil (sem recarregar)
    document.addEventListener('erp_cfg_changed', () => {
      try { refreshFormSelects(); } catch {}
    });

    if (despesaCategoria) despesaCategoria.innerHTML = `<option value="">Selecione tipo primeiro</option>`;
    if (despesaSubtipo && despesaCategoria) {
      despesaSubtipo.addEventListener('change', () => {
        if (despesaSubtipo.value === 'essencial') setOptions(despesaCategoria, getActiveCategories('despesa_essencial'));
        else if (despesaSubtipo.value === 'livre') setOptions(despesaCategoria, getActiveCategories('despesa_livre'));
        else despesaCategoria.innerHTML = `<option value="">Selecione tipo primeiro</option>`;
      });
    }

    // tabela delegation
    if (tbody) tbody.addEventListener('click', (e) => {
      const target = e.target;

      const del = target.classList.contains('btn-del') ? target : target.closest('.btn-del');
      if (del) return deleteTx(del.dataset.id);

      const edt = target.classList.contains('btn-edit') ? target : target.closest('.btn-edit');
      if (edt) return openEditModal(edt.dataset.id);

      const pin = target.classList.contains('btn-pin') ? target : target.closest('.btn-pin');
      if (pin) return openFixarModal(pin.dataset.id);
    });

    // fechar modais ao clicar fora
    if (modalEdit) modalEdit.addEventListener('click', (e) => { if (e.target === modalEdit) window.closeEditModal(); });
    if (modalFixar) modalFixar.addEventListener('click', (e) => { if (e.target === modalFixar) window.closeFixarModal(); });

    // atalhos
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (modalEdit && !modalEdit.classList.contains('hidden')) window.closeEditModal();
      if (modalFixar && !modalFixar.classList.contains('hidden')) window.closeFixarModal();
    });

    // carregar mês inicial (selected_month ou atual)
    activeMonth = activeMonthDefault();
    applyRecorrentesForMonth(activeMonth);
    tx = loadTx(activeMonth);
    Core.selectedMonth.set(userId(), activeMonth);

    setDefaultDates();
    render();
  }

  boot();
})();
