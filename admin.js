/* admin.js — HubitHab Open Financials admin panel */

// ─── State ────────────────────────────────────────────────────────────────────
let appData         = null; // full parsed data.json in memory
let currentMonthIdx = -1;   // index into appData.months for the selected month
let currentFileSha  = null; // GitHub file SHA (required for PUT)

// ─── Auth ─────────────────────────────────────────────────────────────────────
function checkAuth() {
  if (sessionStorage.getItem('admin_auth') === 'true') showPanel();
}

function handlePasswordSubmit() {
  const input = document.getElementById('pw-input').value;
  const errEl = document.getElementById('pw-error');
  if (input === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_auth', 'true');
    errEl.hidden = true;
    showPanel();
  } else {
    errEl.textContent = 'Incorrect password.';
    errEl.hidden = false;
    document.getElementById('pw-input').classList.add('error');
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}

function showPanel() {
  document.getElementById('password-gate').style.display = 'none';
  document.getElementById('admin-panel').removeAttribute('hidden');
  restoreConfig();
  loadDataFromGitHub();
}

// ─── GitHub config ────────────────────────────────────────────────────────────
const SESS = { owner: 'gh_owner', repo: 'gh_repo', branch: 'gh_branch', token: 'gh_token' };

function saveConfig() {
  sessionStorage.setItem(SESS.owner,  document.getElementById('gh-owner').value.trim());
  sessionStorage.setItem(SESS.repo,   document.getElementById('gh-repo').value.trim());
  sessionStorage.setItem(SESS.branch, document.getElementById('gh-branch').value.trim() || 'main');
  sessionStorage.setItem(SESS.token,  document.getElementById('gh-token').value.trim());
  setConfigStatus('Config saved to session.', 'ok');
}

function restoreConfig() {
  document.getElementById('gh-owner').value  = sessionStorage.getItem(SESS.owner)  || '';
  document.getElementById('gh-repo').value   = sessionStorage.getItem(SESS.repo)   || '';
  document.getElementById('gh-branch').value = sessionStorage.getItem(SESS.branch) || 'main';
  document.getElementById('gh-token').value  = sessionStorage.getItem(SESS.token)  || '';
}

function getConfig() {
  return {
    owner:  document.getElementById('gh-owner').value.trim(),
    repo:   document.getElementById('gh-repo').value.trim(),
    branch: document.getElementById('gh-branch').value.trim() || 'main',
    token:  document.getElementById('gh-token').value.trim(),
  };
}

function setConfigStatus(msg, type) {
  const el = document.getElementById('config-status');
  el.textContent = msg;
  el.style.color = type === 'ok'  ? 'var(--green-text)'
                 : type === 'err' ? 'var(--red-text)'
                 : 'var(--text-secondary)';
  if (type === 'ok') setTimeout(() => { el.textContent = ''; }, 3500);
}

// ─── Base64 helpers (UTF-8 safe) ──────────────────────────────────────────────
function encodeBase64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
  );
}

function decodeBase64(b64) {
  return decodeURIComponent(
    atob(b64).split('').map(c =>
      '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
    ).join('')
  );
}

// ─── GitHub API ───────────────────────────────────────────────────────────────
async function loadDataFromGitHub() {
  const cfg = getConfig();

  if (!cfg.owner || !cfg.repo) {
    setConfigStatus('No GitHub config — loading local data.json for preview.', 'warn');
    try {
      const res = await fetch('data.json?v=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      appData = await res.json();
      currentFileSha = null;
      populateMonthSelector();
    } catch (e) {
      setConfigStatus('Failed to load local data.json: ' + e.message, 'err');
    }
    return;
  }

  setConfigStatus('Loading from GitHub…', 'neutral');
  try {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/data.json?ref=${cfg.branch}`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (cfg.token) headers['Authorization'] = 'Bearer ' + cfg.token;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`GitHub ${res.status}: ${err.message}`);
    }
    const json      = await res.json();
    currentFileSha  = json.sha;
    const content   = json.content.replace(/\n/g, '');
    appData         = JSON.parse(decodeBase64(content));
    populateMonthSelector();
    setConfigStatus('Data loaded ✓', 'ok');
  } catch (e) {
    setConfigStatus('Load failed: ' + e.message, 'err');
  }
}

async function saveDataToGitHub() {
  const cfg = getConfig();

  if (!cfg.owner || !cfg.repo) {
    setSaveStatus('Configure GitHub owner and repo first.', false);
    return;
  }
  if (!cfg.token) {
    setSaveStatus('A Personal Access Token is required to save.', false);
    return;
  }

  commitCurrentEdits();
  appData.lastUpdated = currentYearMonth();

  setSaveStatus('Saving…', null);

  try {
    const url  = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/data.json`;
    const body = {
      message: `Update financial data (${new Date().toISOString().split('T')[0]})`,
      content: encodeBase64(JSON.stringify(appData, null, 2)),
      branch:  cfg.branch,
    };
    if (currentFileSha) body.sha = currentFileSha;

    const res = await fetch(url, {
      method:  'PUT',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      // Stale SHA: re-fetch and try again
      if (res.status === 409) {
        setSaveStatus('Conflict detected — reload data and try again.', false);
        return;
      }
      throw new Error(`GitHub ${res.status}: ${err.message}`);
    }

    const data     = await res.json();
    currentFileSha = data.content.sha;
    setSaveStatus('Saved ✓', true);
  } catch (e) {
    setSaveStatus('Save failed: ' + e.message, false);
  }
}

// ─── Month selector ───────────────────────────────────────────────────────────
function populateMonthSelector() {
  const sel   = document.getElementById('month-select');
  const saved = sel.value;
  sel.innerHTML = '<option value="">— select —</option>';

  const sorted = [...appData.months].sort((a, b) => b.month.localeCompare(a.month));
  sorted.forEach(m => {
    const opt      = document.createElement('option');
    opt.value      = m.month;
    opt.textContent = m.label;
    sel.appendChild(opt);
  });

  const newOpt      = document.createElement('option');
  newOpt.value      = '__new__';
  newOpt.textContent = '+ Add new month';
  sel.appendChild(newOpt);

  if (saved) sel.value = saved;
}

function handleMonthSelect(val) {
  const newForm = document.getElementById('new-month-form');
  const editor  = document.getElementById('month-editor');

  if (val === '__new__') {
    newForm.removeAttribute('hidden');
    editor.setAttribute('hidden', '');
    currentMonthIdx = -1;
    return;
  }

  newForm.setAttribute('hidden', '');

  if (!val) {
    editor.setAttribute('hidden', '');
    currentMonthIdx = -1;
    return;
  }

  currentMonthIdx = appData.months.findIndex(m => m.month === val);
  if (currentMonthIdx === -1) return;

  loadMonthIntoEditor(appData.months[currentMonthIdx]);
  editor.removeAttribute('hidden');
}

function loadMonthIntoEditor(month) {
  document.getElementById('mrr-input').value = month.mrr;
  renderExpenseRows(month.expenses);
}

// ─── Expense rows ─────────────────────────────────────────────────────────────
function renderExpenseRows(expenses) {
  document.getElementById('expenses-tbody').innerHTML =
    expenses.map((e, i) => expenseRowHTML(e, i)).join('');
}

function expenseRowHTML(e, idx) {
  const catOpts = ['fixed', 'variable']
    .map(c => `<option value="${c}"${e.category === c ? ' selected' : ''}>${c}</option>`)
    .join('');
  return `
    <tr data-idx="${idx}">
      <td><input type="text"   class="form-input e-label"    value="${escHtml(e.label || '')}"   placeholder="Label"></td>
      <td><input type="number" class="form-input e-amount"   value="${Number(e.amount) || 0}" min="0" step="0.01"></td>
      <td><select class="form-input select-input e-category">${catOpts}</select></td>
      <td><input type="text"   class="form-input e-note"     value="${escHtml(e.note  || '')}"   placeholder="Note"></td>
      <td><button class="btn btn-danger btn-sm del-row-btn" data-idx="${idx}" type="button">×</button></td>
    </tr>
  `;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addExpenseRow() {
  if (currentMonthIdx === -1) return;
  appData.months[currentMonthIdx].expenses.push({ label: '', amount: 0, category: 'fixed', note: '' });
  renderExpenseRows(appData.months[currentMonthIdx].expenses);
  // Focus the new label input
  const rows = document.querySelectorAll('#expenses-tbody tr');
  if (rows.length) rows[rows.length - 1].querySelector('.e-label').focus();
}

function deleteExpenseRow(idx) {
  if (currentMonthIdx === -1) return;
  appData.months[currentMonthIdx].expenses.splice(idx, 1);
  renderExpenseRows(appData.months[currentMonthIdx].expenses);
}

function commitCurrentEdits() {
  if (currentMonthIdx === -1) return;
  const month = appData.months[currentMonthIdx];
  month.mrr   = parseFloat(document.getElementById('mrr-input').value) || 0;
  month.expenses = Array.from(
    document.querySelectorAll('#expenses-tbody tr')
  ).map(row => ({
    label:    row.querySelector('.e-label').value.trim(),
    amount:   parseFloat(row.querySelector('.e-amount').value) || 0,
    category: row.querySelector('.e-category').value,
    note:     row.querySelector('.e-note').value.trim(),
  }));
}

// ─── New month ────────────────────────────────────────────────────────────────
function createNewMonth() {
  const input  = document.getElementById('new-month-input').value.trim();
  const doCopy = document.getElementById('copy-prev').checked;
  const errEl  = document.getElementById('new-month-error');

  if (!/^\d{4}-\d{2}$/.test(input)) {
    errEl.textContent = 'Use YYYY-MM format, e.g. 2025-06';
    errEl.removeAttribute('hidden');
    return;
  }

  if (appData.months.some(m => m.month === input)) {
    errEl.textContent = 'This month already exists.';
    errEl.removeAttribute('hidden');
    return;
  }

  const [year, mo] = input.split('-').map(Number);
  const label = new Date(year, mo - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  let expenses = [];
  if (doCopy && appData.months.length > 0) {
    const recent = [...appData.months].sort((a, b) => b.month.localeCompare(a.month))[0];
    expenses = recent.expenses.map(e => ({ ...e }));
  }

  appData.months.push({ month: input, label, mrr: 0, expenses });
  errEl.setAttribute('hidden', '');
  document.getElementById('new-month-input').value = '';
  document.getElementById('new-month-form').setAttribute('hidden', '');
  populateMonthSelector();
  document.getElementById('month-select').value = input;
  handleMonthSelect(input);
}

// ─── Save status ──────────────────────────────────────────────────────────────
function setSaveStatus(msg, ok) {
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.style.color = ok === true  ? 'var(--green-text)'
                 : ok === false ? 'var(--red-text)'
                 : 'var(--text-secondary)';
  if (ok === true) setTimeout(() => { el.textContent = ''; }, 5000);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Password gate
  document.getElementById('pw-btn').addEventListener('click', handlePasswordSubmit);
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handlePasswordSubmit();
  });

  // Config
  document.getElementById('save-config-btn').addEventListener('click', saveConfig);
  document.getElementById('load-data-btn').addEventListener('click', loadDataFromGitHub);

  // Month selector
  document.getElementById('month-select').addEventListener('change', e => {
    handleMonthSelect(e.target.value);
  });

  // New month
  document.getElementById('create-month-btn').addEventListener('click', createNewMonth);
  document.getElementById('new-month-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') createNewMonth();
  });

  // Expenses
  document.getElementById('add-expense-btn').addEventListener('click', addExpenseRow);
  document.getElementById('expenses-tbody').addEventListener('click', e => {
    if (e.target.matches('.del-row-btn')) {
      deleteExpenseRow(parseInt(e.target.dataset.idx, 10));
    }
  });

  // Save
  document.getElementById('save-btn').addEventListener('click', saveDataToGitHub);
});
