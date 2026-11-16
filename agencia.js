import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataBR = (iso) => iso ? String(iso).split('-').reverse().join('/') : '';
const dataDe = (ts) => (ts && ts.toDate) ? isoLocal(ts.toDate()) : null;
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const diasDaLoja = (l) => Array.isArray(l.diasVisita) ? l.diasVisita : (typeof l.diaVisita === 'number' ? [l.diaVisita] : []);
const norm = (t) => String(t || '').trim().toLowerCase();

let email = null, promotores = [], atual = null, mes = new Date(), cache = {};
const tela = (html) => { $('#corpo').innerHTML = html; if (window.lucide) lucide.createIcons(); };

// ---------- entrada ----------
$('#btn-entrar').addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { console.error(e); alert('Não consegui entrar. Tente de novo.'); }
});
$('#btn-sair').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); return;
  }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  email = (user.email || '').toLowerCase();
  await carregarLista();
});

// ---------- promotores ----------
async function carregarLista() {
  $('#titulo').textContent = 'Promotores';
  tela('<p class="text-gray-500 text-sm">Carregando promotores...</p>');
  try {
    const snap = await getDocs(collection(db, 'vinculos', email, 'promotores'));
    promotores = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderLista();
  } catch (e) {
    console.error(e);
    tela('<p class="text-red-400 text-sm">Não consegui carregar os promotores. Verifique a conexão e as regras do banco.</p>');
  }
}

function renderLista() {
  atual = null;
  $('#titulo').textContent = 'Promotores';
  if (!promotores.length) {
    tela('<p class="text-gray-500 text-sm">Nenhum promotor vinculado a este e-mail ainda. O promotor precisa cadastrar este e-mail como superior no app.</p>');
    return;
  }
  const ordenados = [...promotores].sort((a, b) => (a.apelido || a.nome || '').localeCompare(b.apelido || b.nome || '', 'pt-BR'));
  tela(ordenados.map(p => `
    <div class="card p-4 mb-3 flex items-center gap-2">
      <button data-act="relatorio" data-uid="${esc(p.uid)}" class="flex-1 text-left">
        <div class="text-white font-black italic uppercase text-sm">${esc(p.apelido || p.nome || 'Promotor')}</div>
        <div class="text-gray-500 text-[11px] mt-1">${(p.marcas || []).length ? (p.marcas || []).map(esc).join(' · ') : 'Todas as marcas'}</div>
      </button>
      <button data-act="renomear" data-uid="${esc(p.uid)}" class="p-2 text-amber-500" aria-label="Alterar nome"><i data-lucide="pencil" class="w-4 h-4"></i></button>
      <button data-act="planilha" data-uid="${esc(p.uid)}" class="p-2 text-amber-500" aria-label="Baixar planilha"><i data-lucide="file-spreadsheet" class="w-4 h-4"></i></button>
      <button data-act="remover" data-uid="${esc(p.uid)}" class="p-2 text-red-500" aria-label="Remover promotor"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>`).join(''));
}

async function renomear(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  const novo = prompt('Nome do promotor nesta lista:', p.apelido || p.nome || '');
  if (novo === null) return;
  const apelido = novo.trim().slice(0, 80);
  try {
    await updateDoc(doc(db, 'vinculos', email, 'promotores', uid), { apelido });
    p.apelido = apelido; renderLista();
  } catch (e) { console.error(e); alert('Não consegui alterar o nome.'); }
}

async function remover(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  if (!confirm(`Remover ${p.apelido || p.nome} da sua lista?`)) return;
  try {
    await deleteDoc(doc(db, 'vinculos', email, 'promotores', uid));
    promotores = promotores.filter(x => x.uid !== uid); renderLista();
  } catch (e) { console.error(e); alert('Não consegui remover.'); }
}

// ---------- dados do promotor (somente leitura) ----------
async function dadosDo(uid) {
  if (cache[uid]) return cache[uid];
  const [lojas, visitas, produtos, vencidos] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'lojas')),
    getDocs(collection(db, 'users', uid, 'visitas')),
    getDocs(collection(db, 'users', uid, 'produtos')),
    getDocs(collection(db, 'users', uid, 'vencidos')),
  ]);
  cache[uid] = {
    lojas: lojas.docs.map(d => ({ id: d.id, ...d.data() })),
    visitas: visitas.docs.map(d => ({ id: d.id, ...d.data() })),
    produtos: produtos.docs.map(d => ({ id: d.id, ...d.data() })),
    vencidos: vencidos.docs.map(d => ({ id: d.id, ...d.data() })),
  };
  return cache[uid];
}

// ---------- relatório do promotor ----------
async function abrirRelatorio(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  atual = uid;
  $('#titulo').textContent = p.apelido || p.nome || 'Promotor';
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosDo(uid);
    const todas = [...new Set(d.lojas.flatMap(l => (l.marcas || []).map(m => String(m.nome).trim())).filter(Boolean))];
    const marcas = (p.marcas && p.marcas.length) ? p.marcas : todas;
    const grupos = marcas.map(m => ({
      marca: m,
      lojas: d.lojas.filter(l => (l.marcas || []).some(x => norm(x.nome) === norm(m))),
    }));
    tela(`
      <button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
      <div class="card p-4 mb-3">
        <div class="text-[9px] text-gray-500 font-black uppercase">Promotor</div>
        <div class="text-white font-black text-lg">${esc(p.nome || '')}</div>
      </div>
      <div class="card p-4 mb-3">
        <div class="text-[9px] text-gray-500 font-black uppercase mb-3">Marcas e lojas que atende</div>
        ${grupos.map(g => `
          <div class="mb-4">
            <div class="text-amber-500 font-black uppercase text-sm">${esc(g.marca)}</div>
            ${g.lojas.length ? g.lojas.map(l => `
              <div class="text-gray-200 text-sm mt-1">${esc(l.nome)}
                <span class="text-gray-500 text-[11px]">· ${diasDaLoja(l).map(i => DIAS[i]).join(', ') || 'sem dias definidos'}</span>
              </div>`).join('') : '<div class="text-gray-500 text-xs mt-1">Nenhuma loja com esta marca</div>'}
          </div>`).join('') || '<div class="text-gray-500 text-xs">Nenhuma marca</div>'}
      </div>
      <button data-act="rota" data-uid="${esc(uid)}" class="btn">Ver rota</button>
    `);
  } catch (e) {
    console.error(e);
    tela('<p class="text-red-400 text-sm">Não consegui carregar o relatório.</p>');
  }
}

// ---------- rota em calendário ----------
async function abrirRota(uid) {
  atual = uid; mes = new Date();
  $('#titulo').textContent = 'Rota';
  await rotaRender(null);
}

async function rotaRender(diaSel) {
  const p = promotores.find(x => x.uid === atual); if (!p) return;
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosDo(atual);
    const ativos = new Set([
      ...d.visitas.map(v => v.data),
      ...d.produtos.map(x => dataDe(x.criadoEm)),
      ...d.vencidos.map(x => x.dataRetirada),
    ].filter(Boolean));

    const ano = mes.getFullYear(), m = mes.getMonth();
    const primeiro = new Date(ano, m, 1).getDay(), total = new Date(ano, m + 1, 0).getDate();
    const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let celulas = ''; for (let i = 0; i < primeiro; i++) celulas += '<div></div>';
    for (let k = 1; k <= total; k++) {
      const iso = `${ano}-${String(m + 1).padStart(2, '0')}-${String(k).padStart(2, '0')}`;
      const cl = iso === diaSel ? 'bg-amber-500 text-black' : ativos.has(iso) ? 'border border-amber-500 text-amber-500' : 'text-gray-600';
      celulas += `<button data-act="dia" data-dia="${iso}" class="h-10 rounded-lg text-[11px] font-black ${cl}">${k}</button>`;
    }

    let detalhe = '';
    if (diaSel) {
      const visitas = d.visitas.filter(v => v.data === diaSel).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
      const entradas = d.produtos.filter(x => dataDe(x.criadoEm) === diaSel).length;
      const saidas = d.vencidos.filter(x => x.dataRetirada === diaSel).reduce((t, x) => t + (Number(x.qtd) || 0), 0);
      detalhe = `
        <div class="card p-4 mt-4">
          <div class="text-[9px] text-gray-500 font-black uppercase mb-3">${dataBR(diaSel)}</div>
          ${visitas.length ? visitas.map(v => `
            <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span class="text-white text-sm font-bold">${esc(v.lojaNome || 'Loja')}</span>
              <span class="text-amber-500 text-sm font-black">${esc(v.hora || '')}</span>
            </div>`).join('') : '<div class="text-gray-500 text-xs">Nenhuma visita neste dia.</div>'}
          <div class="grid grid-cols-2 gap-3 mt-4">
            <div class="card p-3 text-center"><div class="text-[9px] text-gray-500 font-black uppercase">Entradas</div><div class="text-2xl font-black text-amber-500">${entradas}</div><div class="text-[10px] text-gray-500">itens cadastrados</div></div>
            <div class="card p-3 text-center"><div class="text-[9px] text-gray-500 font-black uppercase">Saídas</div><div class="text-2xl font-black text-amber-500">${saidas}</div><div class="text-[10px] text-gray-500">unidades retiradas</div></div>
          </div>
        </div>`;
    }

    tela(`
      <button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <button data-act="mes" data-n="-1" class="text-amber-500 font-black px-3 text-lg">‹</button>
          <div class="text-white font-black italic uppercase text-sm">${esc(nomeMes)}</div>
          <button data-act="mes" data-n="1" class="text-amber-500 font-black px-3 text-lg">›</button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[9px] text-gray-600 font-black mb-1">${['D','S','T','Q','Q','S','S'].map(x => `<div>${x}</div>`).join('')}</div>
        <div class="grid grid-cols-7 gap-1">${celulas}</div>
      </div>
      ${detalhe}
    `);
  } catch (e) {
    console.error(e);
    tela('<p class="text-red-400 text-sm">Não consegui carregar a rota.</p>');
  }
}

// ---------- planilha do promotor (CSV) ----------
async function baixarPlanilha(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  try {
    const d = await dadosDo(uid);
    const nomeLoja = (id) => (d.lojas.find(l => l.id === id) || {}).nome || '';
    const linhas = [];
    linhas.push(['VISITAS']); linhas.push(['Data', 'Hora', 'Loja']);
    d.visitas.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
      .forEach(v => linhas.push([dataBR(v.data), v.hora, v.lojaNome || nomeLoja(v.lojaId)]));
    linhas.push([]);
    linhas.push(['ENTRADAS (produtos cadastrados)']); linhas.push(['Data', 'Produto', 'Loja']);
    d.produtos.forEach(x => linhas.push([dataBR(dataDe(x.criadoEm)), x.nome, nomeLoja(x.lojaId)]));
    linhas.push([]);
    linhas.push(['SAÍDAS (vencidos retirados)']); linhas.push(['Data retirada', 'Produto', 'Loja', 'Quantidade', 'Validade', 'Motivo']);
    d.vencidos.forEach(x => linhas.push([dataBR(x.dataRetirada), x.nome, nomeLoja(x.lojaId), x.qtd, dataBR(x.dataVenc), x.motivo || '']));
    const csv = '\uFEFF' + linhas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Relatorio - ${p.apelido || p.nome} - ${isoLocal(new Date())}.csv`;
    a.click();
  } catch (e) { console.error(e); alert('Não consegui gerar a planilha.'); }
}

// ---------- ações ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, uid = b.dataset.uid;
  if (act === 'relatorio') return abrirRelatorio(uid);
  if (act === 'rota') return abrirRota(uid);
  if (act === 'renomear') return renomear(uid);
  if (act === 'planilha') return baixarPlanilha(uid);
  if (act === 'remover') return remover(uid);
  if (act === 'voltar') return renderLista();
  if (act === 'mes') { mes = new Date(mes.getFullYear(), mes.getMonth() + Number(b.dataset.n), 1); return rotaRender(null); }
  if (act === 'dia') return rotaRender(b.dataset.dia);
});
