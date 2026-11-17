import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataBR = (iso) => iso ? String(iso).split('-').reverse().join('/') : '';
const dataDe = (ts) => (ts && ts.toDate) ? ts.toDate() : (ts instanceof Date ? ts : null);
const soNumeros = (t) => String(t || '').replace(/\D/g, '');
const diasDaLoja = (l) => Array.isArray(l.diasVisita) ? l.diasVisita : (typeof l.diaVisita === 'number' ? [l.diaVisita] : []);
const norm = (t) => String(t || '').trim().toLowerCase();
const ufOptions = (sel) => UFS.map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${u}</option>`).join('');

let user = null, perfil = null, email = null, promotores = [], convites = [], atual = null, mes = new Date(), cache = {}, criando = false;

const tela = (html) => { $('#corpo').innerHTML = html; if (window.lucide) lucide.createIcons(); };
const erroBox = (msg) => msg ? `<p class="text-red-400 text-sm mb-3">${esc(msg)}</p>` : '';
const ligarForm = (id, fn) => { const f = document.getElementById(id); if (f) f.addEventListener('submit', fn); };
const msgErro = (e) => {
  const c = (e && e.code) || '';
  if (c === 'auth/email-already-in-use') return 'Este e-mail já tem conta. Entre com ele.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(c)) return 'E-mail ou senha incorretos.';
  if (c === 'auth/weak-password') return 'Senha muito fraca (mínimo 6 caracteres).';
  if (c === 'auth/invalid-email') return 'E-mail inválido.';
  return 'Não consegui concluir. Tente de novo.';
};

// ---------- validação do cadastro ----------
function validar(f, comSenha) {
  if (!String(f.nome || '').trim() || String(f.nome).trim().length < 3) return 'Informe o nome da agência.';
  if (soNumeros(f.cnpj).length !== 14) return 'O CNPJ precisa ter 14 números.';
  if (!UFS.includes(f.uf)) return 'Escolha o estado de atuação.';
  if (soNumeros(f.telefone).length < 10) return 'Informe o WhatsApp com DDD.';
  if (String(f.endereco || '').trim().length < 5) return 'Informe o endereço da agência.';
  if (comSenha) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email || '').trim())) return 'E-mail inválido.';
    if (String(f.senha || '').length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (f.senha !== f.confirma) return 'As senhas não conferem.';
  }
  return null;
}
const perfilDe = (f, emailConta) => ({
  nome: String(f.nome).trim().slice(0, 100),
  cnpj: soNumeros(f.cnpj),
  uf: f.uf,
  telefone: soNumeros(f.telefone),
  endereco: String(f.endereco).trim().slice(0, 200),
  email: emailConta,
  criadoEm: new Date(),
});

// ---------- telas de entrada ----------
function telaEntrar(msg = '') {
  $('#topo').classList.add('hidden');
  tela(`
    <section class="min-h-[85vh] flex flex-col items-center justify-center text-center">
      <img src="logo.png" class="w-28 h-28 rounded-full p-3 bg-black ring-2 ring-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.35)]" alt="">
      <div class="mt-6 text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em]">Agência</div>
      <div class="text-3xl font-black text-amber-500 italic uppercase">Promotor Ajudante</div>
      <div class="mt-6 w-full">${erroBox(msg)}</div>
      <button data-act="google" class="btn mt-2">Entrar com Google</button>
      <div class="text-gray-600 text-xs my-4">ou</div>
      <form id="f-entrar" class="w-full space-y-3 text-left">
        <input name="email" type="email" placeholder="E-mail" class="campo" required>
        <input name="senha" type="password" placeholder="Senha" class="campo" required>
        <button class="btn-line">Entrar com e-mail</button>
      </form>
      <button data-act="ir-criar" class="text-amber-500 text-xs font-black uppercase mt-6">Criar conta da agência</button>
    </section>`);
  ligarForm('f-entrar', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await signInWithEmailAndPassword(auth, String(f.email).trim(), f.senha); }
    catch (err) { telaEntrar(msgErro(err)); }
  });
}

function telaCriar(msg = '', v = {}) {
  $('#topo').classList.add('hidden');
  tela(`
    <button data-act="ir-entrar" class="text-amber-500 text-[11px] font-black uppercase mb-4">← Voltar</button>
    <div class="text-2xl font-black text-amber-500 italic uppercase mb-1">Criar conta</div>
    <p class="text-gray-500 text-xs mb-4">Os dados abaixo ficam ligados à agência.</p>
    ${erroBox(msg)}
    <form id="f-criar" class="space-y-3">
      <input name="nome" class="campo" placeholder="Nome da agência" value="${esc(v.nome || '')}" required>
      <input name="cnpj" inputmode="numeric" class="campo" placeholder="CNPJ (14 números)" value="${esc(v.cnpj || '')}" required>
      <select name="uf" class="campo" required><option value="">Estado de atuação</option>${ufOptions(v.uf)}</select>
      <input name="telefone" inputmode="tel" class="campo" placeholder="WhatsApp com DDD" value="${esc(v.telefone || '')}" required>
      <input name="endereco" class="campo" placeholder="Endereço da agência" value="${esc(v.endereco || '')}" required>
      <input name="email" type="email" class="campo" placeholder="E-mail de acesso" value="${esc(v.email || '')}" required>
      <input name="senha" type="password" class="campo" placeholder="Senha (mínimo 6)" required>
      <input name="confirma" type="password" class="campo" placeholder="Confirmar senha" required>
      <button class="btn mt-2">Criar conta</button>
    </form>`);
  ligarForm('f-criar', criarConta);
}

async function criarConta(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const erro = validar(f, true);
  if (erro) return telaCriar(erro, f);
  criando = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, String(f.email).trim(), f.senha);
    await setDoc(doc(db, 'agencias', cred.user.uid), perfilDe(f, String(f.email).trim().toLowerCase()));
    await sendEmailVerification(cred.user);
    criando = false;
    await handleUser(cred.user);
  } catch (err) {
    criando = false;
    console.error(err);
    telaCriar(msgErro(err), f);
  }
}

function telaVerificar() {
  $('#topo').classList.add('hidden');
  tela(`
    <section class="min-h-[85vh] flex flex-col items-center justify-center text-center px-4">
      <div class="text-2xl font-black text-amber-500 italic uppercase mb-3">Confirme seu e-mail</div>
      <p class="text-gray-400 text-sm mb-6">Enviamos um e-mail de confirmação para <b class="text-white">${esc(user.email)}</b>. Confirme pelo link e volte aqui (confira também a caixa de spam).</p>
      <button data-act="ja-confirmei" class="btn">Já confirmei</button>
      <button data-act="reenviar" class="btn-line mt-3">Reenviar e-mail</button>
      <button data-act="sair" class="text-gray-500 text-xs font-black uppercase mt-6">Sair</button>
    </section>`);
}

function telaComplemento(msg = '', v = {}) {
  $('#topo').classList.add('hidden');
  tela(`
    <div class="text-2xl font-black text-amber-500 italic uppercase mb-1">Dados da agência</div>
    <p class="text-gray-500 text-xs mb-4">Falta só completar o cadastro para continuar.</p>
    ${erroBox(msg)}
    <form id="f-complemento" class="space-y-3">
      <input name="nome" class="campo" placeholder="Nome da agência" value="${esc(v.nome || '')}" required>
      <input name="cnpj" inputmode="numeric" class="campo" placeholder="CNPJ (14 números)" value="${esc(v.cnpj || '')}" required>
      <select name="uf" class="campo" required><option value="">Estado de atuação</option>${ufOptions(v.uf)}</select>
      <input name="telefone" inputmode="tel" class="campo" placeholder="WhatsApp com DDD" value="${esc(v.telefone || '')}" required>
      <input name="endereco" class="campo" placeholder="Endereço da agência" value="${esc(v.endereco || '')}" required>
      <button class="btn mt-2">Salvar e continuar</button>
    </form>
    <button data-act="sair" class="text-gray-500 text-xs font-black uppercase mt-6 w-full">Sair</button>`);
  ligarForm('f-complemento', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const erro = validar(f, false);
    if (erro) return telaComplemento(erro, f);
    try {
      await setDoc(doc(db, 'agencias', user.uid), perfilDe(f, email));
      await handleUser(user);
    } catch (err) { console.error(err); telaComplemento('Não consegui salvar. Tente de novo.', f); }
  });
}

// ---------- convidar promotores (ao menos um) ----------
function telaConvidar(msg = '', valor = '') {
  $('#topo').classList.add('hidden');
  tela(`
    ${convites.length ? '<button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-4">← Voltar</button>' : ''}
    <div class="text-2xl font-black text-amber-500 italic uppercase mb-1">Convidar promotor</div>
    <p class="text-gray-500 text-xs mb-4">Informe o e-mail de pelo menos um promotor. Ele recebe o convite no app e precisa aceitar. O convite vale 7 dias.</p>
    ${erroBox(msg)}
    <form id="f-convidar" class="space-y-3">
      <textarea name="emails" rows="4" class="campo" placeholder="Um e-mail por linha" required>${esc(valor)}</textarea>
      <button class="btn">Enviar convite(s)</button>
    </form>
    <button data-act="sair" class="text-gray-500 text-xs font-black uppercase mt-6 w-full">Sair</button>`);
  ligarForm('f-convidar', enviarConvites);
}

async function enviarConvites(e) {
  e.preventDefault();
  const texto = String(new FormData(e.target).get('emails') || '');
  const lista = [...new Set(texto.split(/[\n,; ]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
  if (!lista.length) return telaConvidar('Informe pelo menos um e-mail de promotor.', texto);
  const invalidos = lista.filter(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) || x === email);
  if (invalidos.length) return telaConvidar('E-mail inválido ou da própria agência: ' + invalidos.join(', '), lista.join('\n'));
  const agora = new Date(), expira = new Date(agora.getTime() + 7 * 86400000);
  try {
    for (const pe of lista) {
      await setDoc(doc(db, 'convites', pe, 'pedidos', user.uid), {
        agenciaUid: user.uid, agenciaNome: perfil.nome, agenciaEmail: email, promotorEmail: pe,
        status: 'pendente', criadoEm: agora, expiraEm: expira,
      });
      await setDoc(doc(db, 'agencias', user.uid, 'convites', pe), { promotorEmail: pe, status: 'pendente', criadoEm: agora, expiraEm: expira });
    }
    await carregarConvites();
    telaPrincipal();
  } catch (err) { console.error(err); telaConvidar('Não consegui enviar os convites. Tente de novo.', lista.join('\n')); }
}

// ---------- fluxo de entrada ----------
async function carregarConvites() {
  const s = await getDocs(collection(db, 'agencias', user.uid, 'convites'));
  convites = s.docs.map(d => ({ promotorEmail: d.id, ...d.data() }));
}

async function handleUser(u) {
  if (criando) return;
  user = u;
  if (!u) return telaEntrar();
  email = (u.email || '').toLowerCase();
  const porSenha = u.providerData.some(p => p.providerId === 'password');
  if (porSenha && !u.emailVerified) return telaVerificar();
  const snap = await getDoc(doc(db, 'agencias', u.uid));
  perfil = snap.exists() ? snap.data() : null;
  if (!perfil) return telaComplemento();
  await carregarConvites();
  const vinc = await getDocs(collection(db, 'vinculos', email, 'promotores'));
  promotores = vinc.docs.map(d => ({ uid: d.id, ...d.data() }));
  if (!promotores.length && !convites.length) return telaConvidar();
  telaPrincipal();
}

onAuthStateChanged(auth, handleUser);

// ---------- tela principal ----------
function telaPrincipal() {
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Promotores';
  atual = null;
  const agora = new Date();
  const linhasConvites = convites.map(c => {
    const exp = dataDe(c.expiraEm);
    const expirado = c.status === 'pendente' && exp && exp < agora;
    const st = expirado ? 'expirado' : c.status;
    const cor = st === 'aceito' ? 'text-green-400' : (st === 'pendente' ? 'text-amber-500' : 'text-red-400');
    return `<div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span class="text-gray-200 text-sm">${esc(c.promotorEmail)}</span>
      <span class="text-[10px] font-black uppercase ${cor}">${esc(st)}</span></div>`;
  }).join('');
  tela(`
    <div class="card p-4 mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="text-[9px] text-gray-500 font-black uppercase">Convites enviados</div>
        <button data-act="novo-convite" class="text-amber-500 text-[10px] font-black uppercase">+ Convidar</button>
      </div>
      ${linhasConvites || '<div class="text-gray-500 text-xs">Nenhum convite enviado.</div>'}
    </div>
    <div id="lista-promotores"></div>`);
  renderListaPromotores();
}

function renderListaPromotores() {
  const box = $('#lista-promotores'); if (!box) return;
  if (!promotores.length) {
    box.innerHTML = '<p class="text-gray-500 text-sm">Nenhum promotor aceitou o convite ainda.</p>';
    return;
  }
  const ordenados = [...promotores].sort((a, b) => (a.apelido || a.nome || '').localeCompare(b.apelido || b.nome || '', 'pt-BR'));
  box.innerHTML = ordenados.map(p => `
    <div class="card p-4 mb-3 flex items-center gap-2">
      <button data-act="relatorio" data-uid="${esc(p.uid)}" class="flex-1 text-left">
        <div class="text-white font-black italic uppercase text-sm">${esc(p.apelido || p.nome || 'Promotor')}</div>
        <div class="text-gray-500 text-[11px] mt-1">${(p.marcas || []).length ? (p.marcas || []).map(esc).join(' · ') : 'Todas as marcas'}</div>
      </button>
      <button data-act="renomear" data-uid="${esc(p.uid)}" class="p-2 text-amber-500" aria-label="Alterar nome"><i data-lucide="pencil" class="w-4 h-4"></i></button>
      <button data-act="planilha" data-uid="${esc(p.uid)}" class="p-2 text-amber-500" aria-label="Baixar planilha"><i data-lucide="file-spreadsheet" class="w-4 h-4"></i></button>
      <button data-act="remover" data-uid="${esc(p.uid)}" class="p-2 text-red-500" aria-label="Remover promotor"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>`).join('');
  if (window.lucide) lucide.createIcons();
}

async function renomear(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  const novo = prompt('Nome do promotor nesta lista:', p.apelido || p.nome || '');
  if (novo === null) return;
  const apelido = novo.trim().slice(0, 80);
  try {
    await updateDoc(doc(db, 'vinculos', email, 'promotores', uid), { apelido });
    p.apelido = apelido; telaPrincipal();
  } catch (e) { console.error(e); alert('Não consegui alterar o nome.'); }
}

async function remover(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  if (!confirm(`Remover ${p.apelido || p.nome} da sua lista?`)) return;
  try {
    await deleteDoc(doc(db, 'vinculos', email, 'promotores', uid));
    promotores = promotores.filter(x => x.uid !== uid); telaPrincipal();
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
  const ISO = (ts) => { const d = dataDe(ts); return d ? isoLocal(d) : null; };
  cache[uid] = {
    lojas: lojas.docs.map(d => ({ id: d.id, ...d.data() })),
    visitas: visitas.docs.map(d => ({ id: d.id, ...d.data() })),
    produtos: produtos.docs.map(d => ({ id: d.id, ...d.data(), dia: ISO(d.data().criadoEm) })),
    vencidos: vencidos.docs.map(d => ({ id: d.id, ...d.data() })),
  };
  return cache[uid];
}

// ---------- relatório ----------
async function abrirRelatorio(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  atual = uid;
  $('#titulo').textContent = p.apelido || p.nome || 'Promotor';
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosDo(uid);
    const todas = [...new Set(d.lojas.flatMap(l => (l.marcas || []).map(m => String(m.nome).trim())).filter(Boolean))];
    const marcas = (p.marcas && p.marcas.length) ? p.marcas : todas;
    const grupos = marcas.map(m => ({ marca: m, lojas: d.lojas.filter(l => (l.marcas || []).some(x => norm(x.nome) === norm(m))) }));
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
      <button data-act="rota" data-uid="${esc(uid)}" class="btn">Ver rota</button>`);
  } catch (e) { console.error(e); tela('<p class="text-red-400 text-sm">Não consegui carregar o relatório.</p>'); }
}

// ---------- rota em calendário ----------
async function abrirRota(uid) { atual = uid; mes = new Date(); await rotaRender(null); }

async function rotaRender(diaSel) {
  const p = promotores.find(x => x.uid === atual); if (!p) return;
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosDo(atual);
    const ativos = new Set([...d.visitas.map(v => v.data), ...d.produtos.map(x => x.dia), ...d.vencidos.map(x => x.dataRetirada)].filter(Boolean));
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
      const entradas = d.produtos.filter(x => x.dia === diaSel).length;
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
      </div>${detalhe}`);
  } catch (e) { console.error(e); tela('<p class="text-red-400 text-sm">Não consegui carregar a rota.</p>'); }
}

// ---------- planilha (CSV) ----------
async function baixarPlanilha(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  try {
    const d = await dadosDo(uid);
    const nomeLoja = (id) => (d.lojas.find(l => l.id === id) || {}).nome || '';
    const linhas = [['VISITAS'], ['Data', 'Hora', 'Loja']];
    d.visitas.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
      .forEach(v => linhas.push([dataBR(v.data), v.hora, v.lojaNome || nomeLoja(v.lojaId)]));
    linhas.push([], ['ENTRADAS (produtos cadastrados)'], ['Data', 'Produto', 'Loja']);
    d.produtos.forEach(x => linhas.push([dataBR(x.dia), x.nome, nomeLoja(x.lojaId)]));
    linhas.push([], ['SAÍDAS (vencidos retirados)'], ['Data retirada', 'Produto', 'Loja', 'Quantidade', 'Validade', 'Motivo']);
    d.vencidos.forEach(x => linhas.push([dataBR(x.dataRetirada), x.nome, nomeLoja(x.lojaId), x.qtd, dataBR(x.dataVenc), x.motivo || '']));
    const csv = '\uFEFF' + linhas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Relatorio - ${p.apelido || p.nome} - ${isoLocal(new Date())}.csv`;
    a.click();
  } catch (e) { console.error(e); alert('Não consegui gerar a planilha.'); }
}

// ---------- ações ----------
$('#btn-sair').addEventListener('click', () => { cache = {}; signOut(auth); });
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, uid = b.dataset.uid;
  if (act === 'google') {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { console.error(err); telaEntrar('Não consegui entrar com o Google. Tente de novo.'); }
  }
  else if (act === 'ir-criar') telaCriar();
  else if (act === 'ir-entrar') telaEntrar();
  else if (act === 'ja-confirmei') {
    await user.reload();
    if (user.emailVerified) handleUser(user); else alert('Ainda não confirmado. Confira seu e-mail (inclusive a caixa de spam).');
  }
  else if (act === 'reenviar') { await sendEmailVerification(user).catch(() => {}); alert('E-mail de confirmação reenviado.'); }
  else if (act === 'sair') { cache = {}; signOut(auth); }
  else if (act === 'novo-convite') telaConvidar();
  else if (act === 'relatorio') abrirRelatorio(uid);
  else if (act === 'rota') abrirRota(uid);
  else if (act === 'renomear') renomear(uid);
  else if (act === 'planilha') baixarPlanilha(uid);
  else if (act === 'remover') remover(uid);
  else if (act === 'voltar') telaPrincipal();
  else if (act === 'mes') { mes = new Date(mes.getFullYear(), mes.getMonth() + Number(b.dataset.n), 1); rotaRender(null); }
  else if (act === 'dia') rotaRender(b.dataset.dia);
});
