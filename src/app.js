import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Init Supabase client
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== STATE =====
let currentUser = null;
let categories = [];
let currentPage = 'dashboard';

// ===== UTILS =====
const fmt = (n, currency = 'TWD') =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const fmtDate = d => new Date(d).toLocaleDateString('zh-TW');

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
};

// ===== DOM HELPERS =====
const $ = id => document.getElementById(id);

function showModal(title, bodyHTML, onSubmit) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  $('modal-overlay').classList.remove('hidden');
  const form = $('modal-body').querySelector('form');
  if (form && onSubmit) form.addEventListener('submit', async e => { e.preventDefault(); await onSubmit(new FormData(form)); });
}

function closeModal() { $('modal-overlay').classList.add('hidden'); }

$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });

// ===== AUTH =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; await initApp(); }
  else showScreen('auth');

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session) { currentUser = session.user; await initApp(); }
    else { currentUser = null; showScreen('auth'); }
  });
}

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $('form-' + tab.dataset.tab).classList.add('active');
  });
});

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: $('login-email').value, password: $('login-password').value
  });
  $('login-error').textContent = error ? error.message : '';
});

$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.signUp({
    email: $('reg-email').value, password: $('reg-password').value,
    options: { data: { display_name: $('reg-name').value } }
  });
  if (error) { $('reg-error').textContent = error.message; }
  else { $('reg-error').textContent = ''; alert('驗證信已寄出，請確認信箱後登入。'); }
});

$('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); });

// ===== THEME =====
(function(){
  const r = document.documentElement;
  let d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  r.setAttribute('data-theme', d);
  const btn = $('btn-theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    d = d === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', d);
  });
})();

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + page).classList.add('active');
  if (page === 'dashboard') loadDashboard();
  else if (page === 'transactions') loadTransactions();
  else if (page === 'investments') loadInvestments();
  else if (page === 'budgets') loadBudgets();
  else if (page === 'categories') loadCategories();
}

// ===== APP INIT =====
async function initApp() {
  showScreen('app');
  // Load categories
  const { data } = await sb.from('categories').select('*').order('name');
  categories = data || [];
  // If no categories, seed defaults
  if (categories.length === 0) {
    await sb.rpc('seed_default_categories', { p_user_id: currentUser.id });
    const { data: cats } = await sb.from('categories').select('*').order('name');
    categories = cats || [];
  }
  // Set user name
  const { data: profile } = await sb.from('profiles').select('display_name').eq('id', currentUser.id).single();
  $('user-name').textContent = profile?.display_name || currentUser.email?.split('@')[0] || 'User';
  // Load initial page
  navigateTo('dashboard');
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const month = thisMonth();
  const start = month + '-01';
  const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth()+1, 0).toISOString().split('T')[0];

  const { data: txs } = await sb.from('transactions')
    .select('*, categories(name,color)')
    .gte('transaction_date', start).lte('transaction_date', end)
    .eq('user_id', currentUser.id);

  const income = (txs||[]).filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = (txs||[]).filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);

  $('kpi-income').textContent = fmt(income);
  $('kpi-expense').textContent = fmt(expense);
  $('kpi-balance').textContent = fmt(income - expense);
  $('kpi-balance').style.color = (income-expense) >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  const { data: portfolio } = await sb.from('portfolio_summary').select('total_cost').eq('user_id', currentUser.id);
  const totalInvest = (portfolio||[]).reduce((s,p)=>s+Number(p.total_cost),0);
  $('kpi-invest').textContent = fmt(totalInvest);

  // Recent transactions
  const recent = (txs||[]).slice(-10).reverse();
  $('recent-transactions').innerHTML = recent.length ? recent.map(t => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);">
      <div>
        <div style="font-size:var(--text-sm);font-weight:500">${t.description || '未命名'}</div>
        <div style="font-size:var(--text-xs);color:var(--color-text-muted)">${fmtDate(t.transaction_date)} · ${t.categories?.name || '無分類'}</div>
      </div>
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--color-${t.type==='income'?'income':'expense'})">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
    </div>`).join('') : '<div class="empty-state">本月尚無記錄</div>';

  // Expense breakdown
  const expTxs = (txs||[]).filter(t=>t.type==='expense');
  const byCategory = {};
  expTxs.forEach(t => {
    const k = t.categories?.name || '未分類';
    byCategory[k] = (byCategory[k]||0) + Number(t.amount);
  });
  const sorted = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
  $('expense-breakdown').innerHTML = sorted.length ? sorted.map(([name, amt]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);">
      <span style="font-size:var(--text-sm)">${name}</span>
      <span style="font-size:var(--text-sm);font-weight:600;font-variant-numeric:tabular-nums">${fmt(amt)}</span>
    </div>`).join('') : '<div class="empty-state">本月尚無支出</div>';
}

// ===== TRANSACTIONS =====
async function loadTransactions(filterType='', filterMonth='') {
  let query = sb.from('transactions').select('*, categories(name,color)').eq('user_id', currentUser.id).order('transaction_date', {ascending: false});
  if (filterType) query = query.eq('type', filterType);
  if (filterMonth) { query = query.gte('transaction_date', filterMonth+'-01').lte('transaction_date', filterMonth+'-31'); }
  const { data: txs } = await query;
  $('tx-tbody').innerHTML = (txs||[]).length ? (txs||[]).map(t => `
    <tr>
      <td>${fmtDate(t.transaction_date)}</td>
      <td><span class="badge badge-${t.type}">${t.type==='income'?'收入':'支出'}</span></td>
      <td>${t.categories?.name || '—'}</td>
      <td>${t.description || '—'}</td>
      <td class="num" style="color:var(--color-${t.type==='income'?'income':'expense'})">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
      <td><button class="btn-icon" onclick="deleteTx('${t.id}')">🗑</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">尚無記錄</td></tr>';
}

window.deleteTx = async (id) => {
  if (!confirm('確定刪除？')) return;
  await sb.from('transactions').delete().eq('id', id);
  loadTransactions();
  if (currentPage === 'dashboard') loadDashboard();
};

$('tx-filter-type').addEventListener('change', () => loadTransactions($('tx-filter-type').value, $('tx-filter-month').value));
$('tx-filter-month').addEventListener('change', () => loadTransactions($('tx-filter-type').value, $('tx-filter-month').value));

function txFormHTML(title) {
  const catOptions = categories.map(c => `<option value="${c.id}" data-type="${c.type}">${c.name}</option>`).join('');
  return `
    <form id="form-tx">
      <div class="field"><label>類型</label>
        <select name="type" class="select" required>
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </select>
      </div>
      <div class="field"><label>分類</label>
        <select name="category_id" class="select">${catOptions}</select>
      </div>
      <div class="field"><label>金額 (TWD)</label>
        <input type="number" name="amount" min="1" step="1" required class="input">
      </div>
      <div class="field"><label>說明</label>
        <input type="text" name="description" class="input" placeholder="選填">
      </div>
      <div class="field"><label>日期</label>
        <input type="date" name="transaction_date" value="${new Date().toISOString().split('T')[0]}" required class="input">
      </div>
      <div class="field"><label>備註</label>
        <input type="text" name="note" class="input" placeholder="選填">
      </div>
      <button type="submit" class="btn btn-primary btn-full">儲存</button>
    </form>`;
}

async function addTransaction(fd) {
  const { error } = await sb.from('transactions').insert({
    user_id: currentUser.id,
    type: fd.get('type'),
    category_id: fd.get('category_id') || null,
    amount: Number(fd.get('amount')),
    description: fd.get('description') || null,
    note: fd.get('note') || null,
    transaction_date: fd.get('transaction_date')
  });
  if (!error) { closeModal(); loadTransactions(); loadDashboard(); }
  else alert(error.message);
}

[$('btn-add-tx'), $('btn-add-tx2')].forEach(btn => btn?.addEventListener('click', () => {
  showModal('新增收支記錄', txFormHTML(), addTransaction);
}));

// ===== INVESTMENTS =====
async function loadInvestments() {
  const { data: positions } = await sb.from('portfolio_summary').select('*').eq('user_id', currentUser.id);
  $('invest-tbody').innerHTML = (positions||[]).length ? positions.map(p => `
    <tr>
      <td><strong>${p.symbol}</strong></td>
      <td>${p.name || '—'}</td>
      <td><span class="badge badge-buy">${p.market}</span></td>
      <td class="num">${Number(p.quantity).toLocaleString()}</td>
      <td class="num">${Number(p.avg_cost).toLocaleString()}</td>
      <td class="num">${fmt(p.total_cost)}</td>
      <td><button class="btn-icon" onclick="deleteInvestment('${p.id}')">🗑</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty-state">尚無持倉</td></tr>';

  const { data: invTxs } = await sb.from('investment_transactions')
    .select('*, investments(symbol)')
    .eq('user_id', currentUser.id)
    .order('transaction_date', {ascending: false})
    .limit(50);
  $('inv-tx-tbody').innerHTML = (invTxs||[]).length ? invTxs.map(t => `
    <tr>
      <td>${fmtDate(t.transaction_date)}</td>
      <td><strong>${t.investments?.symbol || '—'}</strong></td>
      <td><span class="badge badge-${t.action}">${{buy:'買入',sell:'賣出',dividend:'股利'}[t.action]}</span></td>
      <td class="num">${Number(t.quantity).toLocaleString()}</td>
      <td class="num">${Number(t.price).toLocaleString()}</td>
      <td class="num">${Number(t.fee).toLocaleString()}</td>
      <td class="num">${fmt(t.total_amount)}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty-state">尚無交易記錄</td></tr>';
}

window.deleteInvestment = async (id) => {
  if (!confirm('確定刪除此持倉？')) return;
  await sb.from('investments').delete().eq('id', id);
  loadInvestments();
};

$('btn-add-invest').addEventListener('click', () => {
  showModal('新增持倉', `
    <form id="form-invest">
      <div class="field"><label>股票代號</label><input type="text" name="symbol" required class="input" placeholder="例: 2330, NVDA"></div>
      <div class="field"><label>名稱</label><input type="text" name="name" class="input" placeholder="選填"></div>
      <div class="field"><label>市場</label>
        <select name="market" class="select"><option value="TW">台股</option><option value="US">美股</option><option value="CRYPTO">加密貨幣</option><option value="OTHER">其他</option></select>
      </div>
      <div class="field"><label>類型</label>
        <select name="asset_type" class="select"><option value="stock">股票</option><option value="etf">ETF</option><option value="crypto">加密貨幣</option><option value="bond">債券</option><option value="other">其他</option></select>
      </div>
      <div class="field"><label>持倉數量</label><input type="number" name="quantity" step="0.000001" min="0" required class="input"></div>
      <div class="field"><label>平均成本</label><input type="number" name="avg_cost" step="0.0001" min="0" required class="input"></div>
      <div class="field"><label>幣別</label>
        <select name="currency" class="select"><option value="TWD">TWD</option><option value="USD">USD</option></select>
      </div>
      <button type="submit" class="btn btn-primary btn-full">儲存</button>
    </form>`, async fd => {
    const { error } = await sb.from('investments').insert({
      user_id: currentUser.id, symbol: fd.get('symbol').toUpperCase(),
      name: fd.get('name')||null, market: fd.get('market'),
      asset_type: fd.get('asset_type'), quantity: Number(fd.get('quantity')),
      avg_cost: Number(fd.get('avg_cost')), currency: fd.get('currency')
    });
    if (!error) { closeModal(); loadInvestments(); loadDashboard(); }
    else alert(error.message);
  });
});

$('btn-add-inv-tx').addEventListener('click', async () => {
  const { data: invs } = await sb.from('investments').select('id,symbol').eq('user_id', currentUser.id);
  const opts = (invs||[]).map(i=>`<option value="${i.id}">${i.symbol}</option>`).join('');
  showModal('新增投資交易', `
    <form id="form-inv-tx">
      <div class="field"><label>持倉</label><select name="investment_id" class="select" required>${opts||'<option disabled>請先新增持倉</option>'}</select></div>
      <div class="field"><label>動作</label><select name="action" class="select"><option value="buy">買入</option><option value="sell">賣出</option><option value="dividend">股利</option></select></div>
      <div class="field"><label>數量</label><input type="number" name="quantity" step="0.000001" min="0" required class="input"></div>
      <div class="field"><label>價格</label><input type="number" name="price" step="0.0001" min="0" required class="input"></div>
      <div class="field"><label>手續費</label><input type="number" name="fee" step="0.01" min="0" value="0" class="input"></div>
      <div class="field"><label>日期</label><input type="date" name="transaction_date" value="${new Date().toISOString().split('T')[0]}" required class="input"></div>
      <button type="submit" class="btn btn-primary btn-full">儲存</button>
    </form>`, async fd => {
    const { error } = await sb.from('investment_transactions').insert({
      user_id: currentUser.id, investment_id: fd.get('investment_id'),
      action: fd.get('action'), quantity: Number(fd.get('quantity')),
      price: Number(fd.get('price')), fee: Number(fd.get('fee')),
      transaction_date: fd.get('transaction_date')
    });
    if (!error) { closeModal(); loadInvestments(); }
    else alert(error.message);
  });
});

// ===== BUDGETS =====
async function loadBudgets() {
  const { data: budgets } = await sb.from('budgets').select('*, categories(name)').eq('user_id', currentUser.id);
  const month = thisMonth();
  const start = month + '-01';
  const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth()+1, 0).toISOString().split('T')[0];
  const { data: txs } = await sb.from('transactions').select('amount,category_id').eq('user_id', currentUser.id).eq('type','expense').gte('transaction_date', start).lte('transaction_date', end);
  const spendMap = {};
  (txs||[]).forEach(t => { spendMap[t.category_id] = (spendMap[t.category_id]||0) + Number(t.amount); });

  $('budgets-list').innerHTML = (budgets||[]).length ? budgets.map(b => {
    const spent = b.category_id ? (spendMap[b.category_id]||0) : Object.values(spendMap).reduce((a,c)=>a+c,0);
    const pct = Math.min(100, Math.round(spent/b.amount*100));
    const over = spent > b.amount;
    return `<div class="budget-item">
      <div class="budget-item-header">
        <span>${b.name} ${b.categories?`(${b.categories.name})`:''}</span>
        <span style="font-variant-numeric:tabular-nums">${fmt(spent)} / ${fmt(b.amount)}</span>
      </div>
      <div class="budget-bar-bg"><div class="budget-bar-fill${over?' over':''}" style="width:${pct}%"></div></div>
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-1)">${over?'<span style="color:var(--color-expense)">已超出預算</span>':pct+'% 已使用'}</div>
    </div>`;
  }).join('') : '<div class="empty-state">尚無預算目標，點擊右上角新增</div>';
}

$('btn-add-budget').addEventListener('click', () => {
  const catOpts = categories.filter(c=>c.type==='expense').map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  showModal('新增預算目標', `
    <form id="form-budget">
      <div class="field"><label>名稱</label><input type="text" name="name" required class="input" placeholder="例: 餐飲預算"></div>
      <div class="field"><label>分類（選填）</label><select name="category_id" class="select"><option value="">全部支出</option>${catOpts}</select></div>
      <div class="field"><label>預算金額 (TWD)</label><input type="number" name="amount" min="1" required class="input"></div>
      <div class="field"><label>週期</label><select name="period" class="select"><option value="monthly">每月</option><option value="yearly">每年</option></select></div>
      <button type="submit" class="btn btn-primary btn-full">儲存</button>
    </form>`, async fd => {
    const { error } = await sb.from('budgets').insert({
      user_id: currentUser.id, name: fd.get('name'),
      category_id: fd.get('category_id')||null,
      amount: Number(fd.get('amount')), period: fd.get('period'),
    });
    if (!error) { closeModal(); loadBudgets(); }
    else alert(error.message);
  });
});

// ===== CATEGORIES =====
async function loadCategories() {
  const { data } = await sb.from('categories').select('*').eq('user_id', currentUser.id).order('type').order('name');
  categories = data || [];
  const types = { income:'收入', expense:'支出', investment:'投資' };
  const grouped = {};
  categories.forEach(c => { (grouped[c.type] = grouped[c.type]||[]).push(c); });
  $('categories-list').innerHTML = Object.entries(grouped).map(([type, cats]) => `
    <div style="margin-bottom:var(--space-6)">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--space-3)">${types[type]}</div>
      <div class="cat-grid">${cats.map(c=>`
        <div class="cat-chip">
          <span class="cat-dot" style="background:${c.color}"></span>
          <span>${c.name}</span>
          ${!c.is_default?`<button class="btn-icon" style="padding:2px" onclick="deleteCat('${c.id}')">✕</button>`:''}
        </div>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty-state">尚無分類</div>';
}

window.deleteCat = async (id) => {
  if (!confirm('確定刪除此分類？')) return;
  await sb.from('categories').delete().eq('id', id);
  loadCategories();
};

$('btn-add-cat').addEventListener('click', () => {
  showModal('新增分類', `
    <form id="form-cat">
      <div class="field"><label>名稱</label><input type="text" name="name" required class="input"></div>
      <div class="field"><label>類型</label><select name="type" class="select"><option value="expense">支出</option><option value="income">收入</option><option value="investment">投資</option></select></div>
      <div class="field"><label>顏色</label><input type="color" name="color" value="#01696f" class="input" style="height:42px;padding:4px"></div>
      <button type="submit" class="btn btn-primary btn-full">儲存</button>
    </form>`, async fd => {
    const { error } = await sb.from('categories').insert({
      user_id: currentUser.id, name: fd.get('name'),
      type: fd.get('type'), color: fd.get('color')
    });
    if (!error) { closeModal(); loadCategories(); }
    else alert(error.message);
  });
});

// ===== INIT =====
initAuth();
