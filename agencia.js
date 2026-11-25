import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithRedirect, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, deleteUser, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, query, where, arrayUnion } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

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
const celulaSegura = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
const ufOptions = (sel) => UFS.map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${u}</option>`).join('');

// ---------- escolha de perfil: promotor ou agência (antes do login) ----------
const URL_PERFIL = { promotor: 'https://promotor-ajudante.vercel.app', agencia: 'https://agencia-ajudante.vercel.app' };
function fecharEscolhaPerfil() { const o = document.getElementById('escolha-perfil'); if (o) { o.classList.add('hidden'); o.classList.remove('flex'); } }
function mostrarEscolhaPerfil() { const o = document.getElementById('escolha-perfil'); if (o) { o.classList.remove('hidden'); o.classList.add('flex'); } }
function escolherPerfil(perfil) {
  if (perfil === 'agencia') { localStorage.setItem('perfil_escolhido', 'agencia'); fecharEscolhaPerfil(); }
  else location.href = URL_PERFIL.promotor + '/?perfil=promotor';
}
function iniciarEscolhaPerfil() {
  if (new URLSearchParams(location.search).get('perfil') === 'agencia') {
    localStorage.setItem('perfil_escolhido', 'agencia');
    history.replaceState(null, '', location.pathname);
  }
  document.querySelectorAll('[data-escolha]').forEach(b => b.addEventListener('click', () => escolherPerfil(b.dataset.escolha)));
  if (!localStorage.getItem('perfil_escolhido')) mostrarEscolhaPerfil();
}
iniciarEscolhaPerfil();

// Tamanho do texto (normal ou grande), guardado neste aparelho
const aplicarTamanhoTexto = () => { document.documentElement.style.fontSize = localStorage.getItem('agencia_texto_grande') === '1' ? '19px' : ''; };
aplicarTamanhoTexto();
const VERSAO_AGENCIA = 'v1';
document.documentElement.classList.toggle('contraste', localStorage.getItem('agencia_contraste') === '1');
document.body.classList.toggle('compacta', localStorage.getItem('agencia_compacta') === '1');

// Faixa no topo quando não há internet
function atualizarFaixaConexao() {
  let f = document.getElementById('faixa-agencia');
  if (!navigator.onLine) {
    if (!f) {
      f = document.createElement('div');
      f.id = 'faixa-agencia';
      f.className = 'fixed top-0 left-0 right-0 z-[140] bg-red-600 text-white text-[11px] font-black uppercase text-center py-2';
      f.textContent = 'Sem internet. Mostrando os últimos dados salvos.';
      document.body.appendChild(f);
    }
  } else if (f) f.remove();
}
window.addEventListener('online', atualizarFaixaConexao);
window.addEventListener('offline', atualizarFaixaConexao);
atualizarFaixaConexao();

let user = null, perfil = null, email = null, promotores = [], convites = [], atual = null, mes = new Date(), cache = {}, criando = false, busca = '';

const tela = (html) => { $('#corpo').innerHTML = html; if (window.lucide) lucide.createIcons(); };
const erroBox = (msg) => msg ? `<p class="text-red-400 text-sm mb-3">${esc(msg)}</p>` : '';
const ligarForm = (id, fn) => { const f = document.getElementById(id); if (f) f.addEventListener('submit', fn); };
const msgErro = (e) => {
  const c = (e && e.code) || '';
  if (c === 'auth/email-already-in-use') return 'Este e-mail já tem conta. Entre com ele.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(c)) return 'E-mail ou senha incorretos.';
  if (c === 'auth/weak-password') return 'Senha muito fraca (mínimo 6 caracteres).';
  if (c === 'auth/invalid-email') return 'E-mail inválido.';
  if (c === 'auth/network-request-failed' || c === 'unavailable') return 'Sem conexão. Verifique a internet e tente de novo.';
  if (c === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos.';
  if (c === 'permission-denied') return 'Sem permissão. Saia da conta e entre de novo.';
  if (c === 'auth/requires-recent-login') return 'Por segurança, saia e entre de novo.';
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
      <div class="mt-2"></div>
      <form id="f-entrar" class="w-full space-y-3 text-left">
        <input name="email" type="email" placeholder="E-mail" class="campo" required>
        <input name="senha" type="password" placeholder="Senha" class="campo" required>
        <button class="btn-line">Entrar com e-mail</button>
      </form>
      <button data-act="esqueci" class="text-gray-500 text-xs font-black uppercase mt-3">Esqueci a senha</button>
      <button data-act="trocar-perfil" class="text-gray-500 text-[10px] font-black uppercase mt-2">Sou promotor? Trocar perfil</button>
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
    <p class="text-gray-500 text-xs mb-4">Informe o e-mail de pelo menos um promotor. Ele recebe o convite no app e precisa aceitar. O convite vale 15 dias.</p>
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
  const agora = new Date(), expira = new Date(agora.getTime() + 15 * 86400000);
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
  const nomeTopo = $('#nome-agencia'); if (nomeTopo) nomeTopo.textContent = (perfil && perfil.nome) || 'Agência';
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
  ouvirSolicitacoes();
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Promotores';
  atual = null;
  tela(`
    ${('Notification' in window) && Notification.permission !== 'granted' ? `<button data-act="ativar-notif" class="card p-4 mb-4 w-full text-left block"><div class="text-white font-black italic uppercase text-sm">Ativar notificações</div><div class="text-gray-500 text-[11px] mt-1">Receba aviso no celular quando um promotor pedir aprovação</div></button>` : ''}
    ${solicitacoesAg.length ? `<button data-act="solicitacoes" class="card p-4 mb-4 w-full text-left block" style="border:1px solid rgba(245,158,11,0.6)"><div class="text-amber-500 font-black italic uppercase text-sm">Solicitações pendentes · ${solicitacoesAg.length}</div><div class="text-gray-400 text-[11px] mt-1">Sem visita, adiar visita ou dias de visita aguardando sua aprovação</div></button>` : ''}
    <div class="flex gap-2 mb-4">
      <div class="flex-1 relative">
        <i data-lucide="search" class="w-4 h-4 absolute text-gray-500" style="left:16px;top:50%;transform:translateY(-50%)"></i>
        <input id="busca" class="campo" style="padding-left:44px" placeholder="Pesquisar promotor" value="${esc(busca)}">
      </div>
      <button data-act="voz" class="px-4 rounded-2xl border border-amber-500 text-amber-500" aria-label="Pesquisar por voz"><i data-lucide="mic" class="w-5 h-5"></i></button>
    </div>
    <button data-act="marcas-agencia" class="card p-4 mb-4 w-full text-left block">
      <div class="text-[9px] text-gray-500 font-black uppercase">Marcas da agência</div>
      <div class="text-gray-200 text-sm mt-1">${marcasAgencia().length ? marcasAgencia().map(esc).join(' · ') : 'Nenhuma marca cadastrada. Toque para cadastrar.'}</div>
    </button>
    <div id="lista-promotores"></div>`);
  const campoBusca = $('#busca'); if (campoBusca) campoBusca.addEventListener('input', () => { busca = campoBusca.value; renderListaPromotores(); });
  renderListaPromotores();
  if (user && !localStorage.getItem('agencia_tutorial_visto_' + user.uid)) mostrarTutorial();
}

// Resumo da equipe de hoje: visitas feitas, sem visita e saídas, com alerta de quem não registrou visita
async function carregarResumo() {
  const box = $('#resumo-equipe'); if (!box) return;
  if (!promotores.length) { box.innerHTML = '<div class="card p-4 text-gray-500 text-xs">Nenhum promotor na equipe ainda.</div>'; ultimoResumo = null; return; }
  box.innerHTML = `<div class="card p-4 text-gray-500 text-xs">Carregando andamento de hoje: <span id="progresso-carr">0</span> de ${promotores.length}...</div>`;
  const hoje = isoLocal(new Date()), dia = new Date().getDay();
  let prontos = 0;
  const linhas = await Promise.all(promotores.map(async p => {
    try {
      delete cache[p.uid];
      const d = await dadosFiltrados(p.uid);
      const previstas = new Set([
        ...d.lojas.filter(l => diasDaLoja(l).includes(dia) && !d.visitas.some(v => v.lojaId === l.id && v.data === hoje && v.adiadaPara)).map(l => l.id),
        ...d.visitas.filter(v => v.extra && v.data === hoje).map(v => v.lojaId),
      ]).size;
      const feitas = new Set(d.visitas.filter(v => v.data === hoje && !v.semVisita && !v.extra).map(v => v.lojaId)).size;
      const semVisita = d.visitas.filter(v => v.data === hoje && v.semVisita && !v.adiadaPara).length;
      const adiadas = new Set(d.visitas.filter(v => v.data === hoje && v.adiadaPara).map(v => v.lojaId)).size;
      const motivos = d.visitas.filter(v => v.data === hoje && v.semVisita && !v.adiadaPara).map(v => ({ loja: v.lojaNome || '', motivo: v.motivo || '' }));
      const saidas = d.vencidos.filter(v => v.dataRetirada === hoje).reduce((t, v) => t + (Number(v.qtd) || 0), 0);
      const semana = resumoDias(d, 7);
      const semF = semana.reduce((t, s) => t + s.feitas, 0), semP = semana.reduce((t, s) => t + s.previstas, 0);
      return { p, ok: true, previstas, feitas, semVisita, adiadas, motivos, saidas, semF, semP };
    } catch (e) { console.error(e); return { p, ok: false }; }
    finally { prontos++; const c = $('#progresso-carr'); if (c) c.textContent = prontos; }
  }));
  const ordenados = linhas.sort((x, y) => (x.p.apelido || x.p.nome || '').localeCompare(y.p.apelido || y.p.nome || '', 'pt-BR'));
  ultimoResumo = { hoje, ordenados };
  const resolvidas = (l) => l.feitas + l.semVisita + l.adiadas;
  const situacao = (l) => {
    if (!l.ok) return ['Erro', 'text-red-400 border-red-500/50'];
    if (l.previstas === 0 && l.adiadas === 0) return ['Sem dia hoje', 'text-gray-400 border-gray-700'];
    if (l.feitas === 0 && l.semVisita === 0 && l.adiadas === 0) return ['Sem visita', 'text-red-400 border-red-500/60'];
    if (resolvidas(l) >= l.previstas) return ['Concluído', 'text-black bg-amber-500 border-amber-500'];
    return ['Em andamento', 'text-amber-500 border-amber-500/60'];
  };
  const linhasHtml = ordenados.map((l, i) => {
    const nome = esc(l.p.apelido || l.p.nome || 'Promotor');
    const zebra = i % 2 ? 'bg-black/30' : '';
    if (!l.ok) return `<tr class="${zebra} border-t border-gray-800"><td class="px-4 py-3 text-white font-bold">${nome}</td><td colspan="4" class="px-2 py-3 text-red-400 text-xs">Erro ao carregar</td></tr>`;
    const [txt, cls] = situacao(l);
    const pct = l.previstas ? Math.min(100, Math.round(resolvidas(l) / l.previstas * 100)) : 0;
    return `<tr class="${zebra} border-t border-gray-800">
      <td class="px-4 py-3 align-top"><div class="text-white font-bold leading-tight">${nome}</div><span class="inline-block mt-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase whitespace-nowrap ${cls}">${txt}</span>${l.motivos.map(m => `<div class="text-[10px] text-gray-400 mt-1 leading-tight break-words max-w-[9rem]"><span class="text-gray-500">${esc(m.loja || 'Loja')}:</span> <span class="text-gray-200">${esc(m.motivo || 'sem motivo')}</span></div>`).join('')}</td>
      <td class="px-2 py-3 text-center"><div class="text-amber-500 font-black">${l.feitas}<span class="text-gray-500 font-bold"> / ${l.previstas}</span></div><div class="h-1.5 w-16 mx-auto mt-1 rounded bg-gray-800 overflow-hidden"><div class="h-1.5 bg-amber-500" style="width:${pct}%"></div></div></td>
      <td class="px-2 py-3 text-center font-black ${l.semVisita ? 'text-red-400' : 'text-gray-600'}">${l.semVisita}</td>
      <td class="px-2 py-3 text-center font-black ${l.adiadas ? 'text-amber-500' : 'text-gray-600'}">${l.adiadas}</td>
      <td class="px-4 py-3 text-right font-black text-amber-500">${l.saidas}<span class="text-gray-500 font-bold text-[10px]"> un.</span></td>
    </tr>`;
  }).join('');
  const T = ordenados.filter(l => l.ok).reduce((t, l) => ({ f: t.f + l.feitas, p: t.p + l.previstas, s: t.s + l.semVisita, a: t.a + l.adiadas, u: t.u + l.saidas }), { f: 0, p: 0, s: 0, a: 0, u: 0 });
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rank = rankingDe(ordenados);
  box.innerHTML = `<div class="card overflow-hidden mb-4">
    <div class="px-4 pt-4 pb-3 flex items-end justify-between border-b border-amber-500/30">
      <div><div class="text-[9px] text-gray-500 font-black uppercase">Andamento do dia</div><div class="text-amber-500 font-black italic uppercase text-xl">${dataBR(hoje)}</div></div>
      <div class="text-[10px] text-gray-500">Atualizado ${hora}</div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-[9px] text-gray-500 font-black uppercase whitespace-nowrap">
          <th class="px-4 py-2 text-left">Promotor</th><th class="px-2 py-2 text-center">Visitas</th><th class="px-2 py-2 text-center">Sem visita</th><th class="px-2 py-2 text-center">Adiadas</th><th class="px-4 py-2 text-right">Retirado</th>
        </tr></thead>
        <tbody>${linhasHtml}</tbody>
        <tfoot><tr class="border-t-2 border-amber-500 bg-amber-500/10">
          <td class="px-4 py-3 text-amber-500 font-black uppercase text-[11px]">Total</td>
          <td class="px-2 py-3 text-center text-amber-500 font-black">${T.f} / ${T.p}</td>
          <td class="px-2 py-3 text-center text-red-400 font-black">${T.s}</td>
          <td class="px-2 py-3 text-center text-amber-500 font-black">${T.a}</td>
          <td class="px-4 py-3 text-right text-amber-500 font-black">${T.u} un.</td>
        </tr></tfoot>
      </table>
    </div>
  </div>
  <div class="card p-4">
    <div class="text-[9px] text-gray-500 font-black uppercase mb-3">Ranking · últimos 7 dias</div>
    ${rank.map((r, i) => `<div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span class="text-gray-200 text-sm"><span class="text-amber-500 font-black">${i + 1}º</span> ${esc(r.nome)}</span>
      <span class="text-xs"><span class="text-amber-500 font-black">${r.pct}%</span> <span class="text-gray-500">${r.f} de ${r.p}</span></span>
    </div>`).join('') || '<div class="text-gray-500 text-xs">Sem dados na semana.</div>'}
  </div>`;
}

function renderListaPromotores() {
  const box = $('#lista-promotores'); if (!box) return;
  if (!promotores.length) {
    box.innerHTML = '<p class="text-gray-500 text-sm">Nenhum promotor aceitou o convite ainda.</p>';
    return;
  }
  const ordenados = promotores.filter(p => norm(p.apelido || p.nome).includes(norm(busca))).sort((a, b) => (a.apelido || a.nome || '').localeCompare(b.apelido || b.nome || '', 'pt-BR'));
  box.innerHTML = ordenados.map(p => `
    <div class="card p-4 mb-3 flex items-center gap-2">
      <button data-act="relatorio" data-uid="${esc(p.uid)}" class="flex-1 text-left">
        <div class="text-white font-black italic uppercase text-sm">${esc(p.apelido || p.nome || 'Promotor')}</div>
        <div class="text-gray-500 text-[11px] mt-1">${(p.marcas || []).length ? (p.marcas || []).map(esc).join(' · ') : 'Todas as marcas'}</div>
      </button>
      <button data-act="marcas-promotor" data-uid="${esc(p.uid)}" class="p-2 text-amber-500" aria-label="Marcas do promotor"><i data-lucide="tags" class="w-4 h-4"></i></button>
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
    desfazerBox(`${p.apelido || p.nome || 'Promotor'} removido.`, async () => {
      try {
        const { uid: _uid, ...dados } = p;
        await setDoc(doc(db, 'vinculos', email, 'promotores', uid), dados);
        promotores.push(p); telaPrincipal();
      } catch (err) { console.error(err); alert('Não consegui desfazer. Convide o promotor de novo.'); }
    });
  } catch (e) { console.error(e); alert('Não consegui remover.'); }
}

// Aviso com botão Desfazer por alguns segundos
function desfazerBox(msg, fn) {
  const antigo = document.getElementById('desfazer-ag'); if (antigo) antigo.remove();
  const b = document.createElement('div');
  b.id = 'desfazer-ag';
  b.className = 'fixed left-4 right-4 bottom-6 mx-auto max-w-sm z-[120] rounded-2xl px-4 py-3 bg-gray-900 border border-amber-500/50 flex items-center justify-between gap-3';
  b.innerHTML = `<span class="text-[12px] text-gray-200">${esc(msg)}</span><button class="text-amber-500 font-black text-[11px] uppercase">Desfazer</button>`;
  b.querySelector('button').onclick = () => { b.remove(); fn(); };
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 6000);
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

// ---------- marcas da agência e filtro por marca ----------
const marcasAgencia = () => Array.isArray(perfil && perfil.marcas) ? perfil.marcas : [];

// Dados do promotor só das marcas que a agência escolheu para ele
async function dadosFiltrados(uid) {
  const d = await dadosDo(uid);
  const p = promotores.find(x => x.uid === uid);
  const sel = ((p && p.marcas) || []).map(norm).filter(Boolean);
  if (!sel.length) return { ...d, semFiltro: true };
  const lojas = d.lojas.filter(l => (l.marcas || []).some(m => sel.includes(norm(m.nome))));
  const lojaIds = new Set(lojas.map(l => l.id));
  const daMarca = (x) => { const m = norm(x.marcaNome || x.marca); return m ? sel.includes(m) : lojaIds.has(x.lojaId); };
  return {
    lojas,
    visitas: d.visitas.filter(v => lojaIds.has(v.lojaId)),
    produtos: d.produtos.filter(daMarca),
    vencidos: d.vencidos.filter(daMarca),
    semFiltro: false,
  };
}

function telaMarcasAgencia(msg = '') {
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Marcas';
  const lista = marcasAgencia();
  tela(`
    <button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
    <p class="text-gray-500 text-xs mb-4">Cadastre as marcas que a agência representa. Depois, escolha quais marcas cada promotor atende.</p>
    ${erroBox(msg)}
    <div class="card p-4 mb-4">
      ${lista.length ? lista.map(m => `<div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"><span class="text-white text-sm font-bold">${esc(m)}</span><button data-act="rem-marca" data-nome="${esc(m)}" class="text-red-500 text-[10px] font-black uppercase">Remover</button></div>`).join('') : '<div class="text-gray-500 text-xs">Nenhuma marca ainda.</div>'}
    </div>
    <form id="f-marca" class="flex gap-2">
      <input name="nome" class="campo" placeholder="Nome da marca" maxlength="60" required>
      <button class="btn-line" style="width:auto;padding:14px 18px">Adicionar</button>
    </form>`);
  ligarForm('f-marca', adicionarMarca);
}

async function adicionarMarca(e) {
  e.preventDefault();
  const nome = String(new FormData(e.target).get('nome') || '').trim().slice(0, 60);
  if (!nome) return telaMarcasAgencia('Digite o nome da marca.');
  const lista = marcasAgencia();
  if (lista.some(m => norm(m) === norm(nome))) return telaMarcasAgencia('Essa marca já está cadastrada.');
  await salvarMarcasAgencia([...lista, nome]);
}

async function salvarMarcasAgencia(nova) {
  try {
    await updateDoc(doc(db, 'agencias', user.uid), { marcas: nova });
    perfil.marcas = nova;
    telaMarcasAgencia();
  } catch (err) { console.error(err); telaMarcasAgencia('Não consegui salvar. Tente de novo.'); }
}

function telaMarcasPromotor(uid, msg = '') {
  const p = promotores.find(x => x.uid === uid); if (!p) return telaPrincipal();
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Marcas do promotor';
  const lista = marcasAgencia(), atuais = p.marcas || [];
  tela(`
    <button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
    <div class="text-white font-black italic uppercase text-lg mb-1">${esc(p.apelido || p.nome || 'Promotor')}</div>
    <p class="text-gray-500 text-xs mb-4">Marque só as marcas que este promotor atende para a sua agência. Os relatórios mostram apenas essas marcas.</p>
    ${erroBox(msg)}
    ${lista.length ? `<form id="f-marcas-p" class="space-y-3">
      <div class="card p-4">${lista.map(m => `<label class="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0 text-gray-200 text-sm"><input type="checkbox" name="m" value="${esc(m)}" ${atuais.includes(m) ? 'checked' : ''} class="w-5 h-5 accent-amber-500"> ${esc(m)}</label>`).join('')}</div>
      <button class="btn">Salvar marcas</button>
    </form>` : `<div class="card p-4 text-gray-400 text-sm mb-3">Cadastre antes as marcas da agência.</div>
      <button data-act="marcas-agencia" class="btn-line">Cadastrar marcas</button>`}`);
  ligarForm('f-marcas-p', (e) => salvarMarcasPromotor(e, uid));
}

async function salvarMarcasPromotor(e, uid) {
  e.preventDefault();
  const sel = new FormData(e.target).getAll('m').map(String);
  if (!sel.length) return telaMarcasPromotor(uid, 'Escolha pelo menos uma marca.');
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  try {
    await updateDoc(doc(db, 'vinculos', email, 'promotores', uid), { marcas: sel });
    p.marcas = sel;
    telaPrincipal();
  } catch (err) { console.error(err); telaMarcasPromotor(uid, 'Não consegui salvar. Tente de novo.'); }
}

// Pesquisa por voz (navegador)
function iniciarVoz() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return alert('Seu navegador não tem pesquisa por voz. Digite o nome.');
  const r = new R();
  r.lang = 'pt-BR'; r.interimResults = false;
  r.onresult = (e) => {
    busca = String(e.results[0][0].transcript || '').replace(/[.!?]+$/, '').trim();
    const campo = $('#busca'); if (campo) campo.value = busca;
    renderListaPromotores();
  };
  r.onerror = () => alert('Não consegui ouvir. Tente de novo.');
  r.start();
}

// ---------- convites enviados (dentro de Configurações) ----------
function telaConvites() {
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Convites';
  const agora = new Date();
  const linhasConvites = convites.map(c => {
    const exp = dataDe(c.expiraEm);
    const expirado = c.status === 'pendente' && exp && exp < agora;
    const st = expirado ? 'expirado' : c.status;
    const cor = st === 'aceito' ? 'text-green-400' : (st === 'pendente' ? 'text-amber-500' : 'text-red-400');
    return `<div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span class="text-gray-200 text-sm">${esc(c.promotorEmail)}</span>
      <span class="text-[10px] font-black uppercase ${cor}">${esc(st)}</span>${st === 'expirado' ? `<button data-act="reenviar-convite" data-email="${esc(c.promotorEmail)}" class="ml-2 text-amber-500 text-[10px] font-black uppercase">Reenviar</button>` : ''}${st === 'pendente' ? `<button data-act="remover-convite" data-email="${esc(c.promotorEmail)}" class="ml-2 text-red-500 text-[10px] font-black uppercase">Remover</button>` : ''}</div>`;
  }).join('');
  tela(`
    <button data-act="config" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Configurações</button>
    <div class="card p-4 mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="text-[9px] text-gray-500 font-black uppercase">Convites enviados</div>
        <button data-act="novo-convite" class="text-amber-500 text-[10px] font-black uppercase">+ Convidar</button>
      </div>
      ${linhasConvites || '<div class="text-gray-500 text-xs">Nenhum convite enviado.</div>'}
    </div>`);
}

// ---------- apoio: dias, ranking, marcas e PDF ----------
let ultimoResumo = null;

// Visitas previstas e feitas dos últimos n dias
function resumoDias(d, n) {
  const hoje = new Date(), out = [];
  for (let k = n - 1; k >= 0; k--) {
    const dt = new Date(hoje); dt.setDate(hoje.getDate() - k);
    const iso = isoLocal(dt), w = dt.getDay();
    const previstas = new Set([
      ...d.lojas.filter(l => diasDaLoja(l).includes(w) && !d.visitas.some(v => v.lojaId === l.id && v.data === iso && v.adiadaPara)).map(l => l.id),
      ...d.visitas.filter(v => v.extra && v.data === iso).map(v => v.lojaId),
    ]).size;
    const feitas = new Set(d.visitas.filter(v => v.data === iso && !v.semVisita && !v.extra).map(v => v.lojaId)).size;
    out.push({ iso, previstas, feitas });
  }
  return out;
}

// Ranking da semana por percentual de cumprimento
function rankingDe(ordenados) {
  return ordenados.filter(l => l.ok).map(l => ({
    nome: l.p.apelido || l.p.nome || 'Promotor',
    f: l.semF, p: l.semP,
    pct: l.semP ? Math.round(l.semF / l.semP * 100) : 0,
  })).sort((x, y) => y.pct - x.pct || y.f - x.f);
}

// Vencidos retirados por marca e mês (últimos 6 meses)
function motivosSemana(d) {
  const hoje = isoLocal(new Date()), ini = isoLocal(new Date(Date.now() - 6 * 86400000));
  return d.visitas.filter(v => v.semVisita && !v.adiadaPara && v.data >= ini && v.data <= hoje)
    .sort((x, y) => y.data.localeCompare(x.data))
    .map(v => ({ data: v.data, loja: v.lojaNome || '', motivo: v.motivo || '' }));
}

function vencidosPorMarcaHtml(d) {
  const mapa = {};
  d.vencidos.forEach(v => {
    const marca = String(v.marcaNome || v.marca || 'Sem marca').trim();
    const mes = String(v.dataRetirada || '').slice(0, 7);
    if (!mes) return;
    mapa[marca] = mapa[marca] || {};
    mapa[marca][mes] = (mapa[marca][mes] || 0) + (Number(v.qtd) || 0);
  });
  const marcas = Object.keys(mapa).sort((x, y) => x.localeCompare(y, 'pt-BR'));
  if (!marcas.length) return '<div class="text-gray-500 text-xs">Nenhum vencido retirado ainda.</div>';
  return marcas.map(m => {
    const meses = Object.entries(mapa[m]).sort((x, y) => y[0].localeCompare(x[0])).slice(0, 6);
    return `<div class="mb-3"><div class="text-amber-500 font-black uppercase text-sm mb-1">${esc(m)}</div>
      ${meses.map(([mes, q]) => `<div class="flex justify-between text-xs py-1 border-b border-gray-800 last:border-0"><span class="text-gray-400">${esc(mes.split('-').reverse().join('/'))}</span><span class="text-gray-200 font-bold">${q} un.</span></div>`).join('')}
    </div>`;
  }).join('');
}

async function reenviarConvite(pe) {
  const agora = new Date(), expira = new Date(agora.getTime() + 15 * 86400000);
  try {
    await setDoc(doc(db, 'convites', pe, 'pedidos', user.uid), {
      agenciaUid: user.uid, agenciaNome: perfil.nome, agenciaEmail: email, promotorEmail: pe,
      status: 'pendente', criadoEm: agora, expiraEm: expira,
    });
    await setDoc(doc(db, 'agencias', user.uid, 'convites', pe), { promotorEmail: pe, status: 'pendente', criadoEm: agora, expiraEm: expira });
    await carregarConvites();
    telaConvites();
  } catch (err) { console.error(err); alert('Não consegui reenviar o convite. Tente de novo.'); }
}

async function removerConvite(pe) {
  if (!confirm(`Remover o convite enviado para ${pe}?`)) return;
  try {
    await deleteDoc(doc(db, 'convites', pe, 'pedidos', user.uid));
    await deleteDoc(doc(db, 'agencias', user.uid, 'convites', pe));
    await carregarConvites();
    telaConvites();
  } catch (err) { console.error(err); alert('Não consegui remover o convite.'); }
}

function imprimirEquipe() {
  if (!ultimoResumo) return alert('Aguarde o carregamento da equipe.');
  const { hoje, ordenados } = ultimoResumo;
  const ok = ordenados.filter(l => l.ok);
  const T = ok.reduce((t, l) => ({ f: t.f + l.feitas, p: t.p + l.previstas, s: t.s + l.semVisita, a: t.a + l.adiadas, u: t.u + l.saidas }), { f: 0, p: 0, s: 0, a: 0, u: 0 });
  const linhas = ok.map(l => `<tr><td>${esc(l.p.apelido || l.p.nome || 'Promotor')}</td><td style="text-align:center">${l.feitas} / ${l.previstas}</td><td style="text-align:center">${l.semVisita}</td><td style="text-align:center">${l.adiadas}</td><td style="text-align:right">${l.saidas} un.</td></tr>`).join('');
  const rank = rankingDe(ordenados).map((r, i) => `<tr><td>${i + 1}º ${esc(r.nome)}</td><td style="text-align:center">${r.f} de ${r.p}</td><td style="text-align:right">${r.pct}%</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Equipe ${dataBR(hoje)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;padding:20px}h1{font-size:18px;margin:0 0 4px;color:#b45309}h2{font-size:13px;margin:22px 0 6px;color:#b45309;text-transform:uppercase}
    p{font-size:12px;color:#555;margin:0}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
    th{background:#f59e0b;color:#111;font-size:11px;text-transform:uppercase}tfoot td{border-top:2px solid #f59e0b;font-weight:bold;background:#fef3c7}</style></head><body>
    <h1>Equipe hoje · ${dataBR(hoje)}</h1><p>${esc(perfil && perfil.nome ? perfil.nome : 'Agência')}</p>
    <table><thead><tr><th>Promotor</th><th style="text-align:center">Visitas</th><th style="text-align:center">Sem visita</th><th style="text-align:center">Adiadas</th><th style="text-align:right">Retirado</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="5">Nenhum promotor.</td></tr>'}</tbody>
    <tfoot><tr><td>Total</td><td style="text-align:center">${T.f} / ${T.p}</td><td style="text-align:center">${T.s}</td><td style="text-align:center">${T.a}</td><td style="text-align:right">${T.u} un.</td></tr></tfoot></table>
    <h2>Ranking · últimos 7 dias</h2>
    <table><thead><tr><th>Promotor</th><th style="text-align:center">Visitas</th><th style="text-align:right">Cumprimento</th></tr></thead><tbody>${rank || '<tr><td colspan="3">Sem dados.</td></tr>'}</tbody></table>
    </body></html>`;
  const j = window.open('', '_blank');
  if (!j) return alert('Permita abrir janelas para gerar o PDF.');
  j.document.write(html); j.document.close(); j.focus(); setTimeout(() => j.print(), 300);
}

// ---------- notificações no celular ----------
// Com o app aberto, o Firebase entrega o aviso ao próprio app: mostramos a notificação do celular aqui.
let avisosOuvidos = false;
async function ouvirAvisos() {
  if (avisosOuvidos || !(await isSupported()) || Notification.permission !== 'granted') return;
  avisosOuvidos = true;
  onMessage(getMessaging(getApp()), (payload) => {
    const n = payload.notification || {};
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) reg.showNotification(n.title || 'Agência', { body: n.body || '', icon: 'icon-192.png', data: { url: '/' } });
    });
  });
}
ouvirAvisos().catch(() => {});

async function ativarNotificacoes() {
  try {
    if (!(await isSupported())) return alert('Este aparelho não aceita notificações.');
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(getApp()), { vapidKey: window.FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error('sem token');
    await updateDoc(doc(db, 'agencias', user.uid), { fcmTokens: arrayUnion(token) });
    avisosOuvidos = false; ouvirAvisos().catch(() => {});
    telaPrincipal();
    alert('Notificações ativadas neste aparelho.');
  } catch (err) { console.error(err); alert('Não consegui ativar as notificações. Detalhe: ' + (err.code || err.message || err)); }
}

// ---------- solicitações de aprovação (sem visita, adiar, dias de visita) ----------
let solicitacoesAg = [];
let unsubSol = null;
function ouvirSolicitacoes() {
  if (unsubSol || !email) return;
  unsubSol = onSnapshot(query(collection(db, 'solicitacoes'), where('aprovadores', 'array-contains', email)), (snap) => {
    solicitacoesAg = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status === 'pendente');
    if ($('#titulo').textContent === 'Promotores') telaPrincipal();
    else if ($('#titulo').textContent === 'Solicitações') telaSolicitacoes();
  }, (e) => console.warn('solicitacoes:', e));
}

function telaSolicitacoes() {
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Solicitações';
  const tipos = { sem_visita: 'Sem visita hoje', adiar: 'Adiar visita', dias: 'Dias de visita' };
  const diasNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const detalhe = (s) => {
    const pl = s.payload || {};
    if (s.tipo === 'sem_visita') return `${pl.data ? dataBR(pl.data) : ''}${pl.hora ? ' às ' + esc(pl.hora) : ''}<br><b class="text-gray-100">${esc(pl.motivo || 'Sem motivo informado')}</b>`;
    if (s.tipo === 'adiar') return `De ${dataBR(pl.de)} para <b class="text-gray-100">${dataBR(pl.para)}</b>`;
    return `Dias: <b class="text-gray-100">${(pl.dias || []).map(d => diasNomes[d]).join(', ') || 'nenhum'}</b>`;
  };
  const lista = solicitacoesAg.map(s => `<div class="card p-4 mb-3">
      <div class="text-[9px] text-gray-500 font-black uppercase">${esc(s.promotorNome || 'Promotor')} · ${tipos[s.tipo] || esc(s.tipo)}</div>
      <div class="text-white font-black italic uppercase text-sm mt-1">${esc(s.lojaNome || 'Loja')}</div>
      <div class="text-gray-400 text-xs mt-1">${detalhe(s)}</div>
      <div class="flex gap-2 mt-3">
        <button data-act="sol-recusar" data-id="${esc(s.id)}" class="flex-1 py-2 rounded-xl border border-red-900/60 text-red-500 text-[10px] font-black uppercase">Recusar</button>
        <button data-act="sol-aprovar" data-id="${esc(s.id)}" class="flex-1 py-2 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase">Aprovar</button>
      </div>
    </div>`).join('');
  tela(`<button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
    ${lista || '<p class="text-gray-500 text-sm">Nenhuma solicitação pendente.</p>'}`);
}

async function responderSolicitacao(id, status) {
  try {
    await updateDoc(doc(db, 'solicitacoes', id), { status, respondidoEm: new Date(), respondidoPor: email });
    solicitacoesAg = solicitacoesAg.filter(x => x.id !== id);
    telaSolicitacoes();
  } catch (err) { console.error(err); alert('Não consegui responder agora. Tente de novo.'); }
}

// ---------- conta: senha, compartilhar e excluir ----------
async function resetSenha(endereco) {
  if (!endereco) return alert('Não encontrei o e-mail da conta.');
  try {
    await sendPasswordResetEmail(auth, endereco);
    alert('Enviamos o link para trocar a senha. Confira o e-mail (e a caixa de spam).');
  } catch (err) { console.error(err); alert('Não consegui enviar o link agora. Tente de novo.'); }
}

function esqueciSenha() {
  const campo = document.querySelector('#f-entrar input[name="email"]');
  const endereco = campo ? campo.value.trim() : '';
  if (!endereco) return alert('Digite seu e-mail no campo acima e toque em "Esqueci a senha" de novo.');
  resetSenha(endereco);
}

async function compartilharResumo() {
  if (!ultimoResumo) return alert('Aguarde o carregamento da equipe.');
  const { hoje, ordenados } = ultimoResumo;
  const linhas = ordenados.map(l => {
    const nome = l.p.apelido || l.p.nome || 'Promotor';
    return l.ok ? `• ${nome}: ${l.feitas} de ${l.previstas} visitas, ${l.semVisita} sem visita, ${l.adiadas} adiada(s), ${l.saidas} un. retiradas` : `• ${nome}: erro ao carregar`;
  });
  const texto = `Equipe hoje · ${dataBR(hoje)}\n${linhas.join('\n')}`;
  try {
    if (navigator.share) await navigator.share({ text: texto });
    else { await navigator.clipboard.writeText(texto); alert('Resumo copiado.'); }
  } catch (err) { if (err.name !== 'AbortError') alert('Não consegui compartilhar.'); }
}

async function excluirConta() {
  if (!confirm('Excluir sua conta da agência? Os convites e os vínculos com os promotores serão apagados. Essa ação não pode ser desfeita.')) return;
  try {
    const conv = await getDocs(collection(db, 'agencias', user.uid, 'convites'));
    for (const c of conv.docs) {
      await deleteDoc(doc(db, 'convites', c.id, 'pedidos', user.uid)).catch(() => {});
      await deleteDoc(c.ref).catch(() => {});
    }
    const vinc = await getDocs(collection(db, 'vinculos', email, 'promotores'));
    for (const v of vinc.docs) await deleteDoc(v.ref).catch(() => {});
    await deleteDoc(doc(db, 'agencias', user.uid));
    cache = {};
    await deleteUser(user);
  } catch (err) {
    console.error(err);
    alert(err.code === 'auth/requires-recent-login'
      ? 'Por segurança, saia da conta, entre de novo e tente excluir outra vez.'
      : 'Não consegui excluir agora. Tente de novo.');
  }
}

// ---------- tutorial de primeiro acesso ----------
const TUTORIAL = [
  ['Convide seus promotores', 'Em Configurações, abra Convites enviados e informe o e-mail de cada promotor. Ele recebe o convite no app.'],
  ['Escolha as marcas de cada um', 'Cadastre as marcas da agência e, em cada promotor, marque só as que ele atende para você.'],
  ['Acompanhe a equipe', 'A tela inicial mostra os promotores. Em Configurações, veja a Equipe hoje, o ranking e o PDF.'],
];
function mostrarTutorial() {
  if (document.getElementById('tutorial-ag') || !user) return;
  let i = 0;
  const ov = document.createElement('div');
  ov.id = 'tutorial-ag';
  ov.className = 'fixed inset-0 z-[130] bg-black/95 flex items-center justify-center p-6';
  const fechar = () => { localStorage.setItem('agencia_tutorial_visto_' + user.uid, '1'); ov.remove(); };
  const desenha = () => {
    const [t, s] = TUTORIAL[i], ultimo = i === TUTORIAL.length - 1;
    ov.innerHTML = `<div class="w-full max-w-sm card p-6 text-center">
      <div class="text-[9px] text-gray-500 font-black uppercase mb-2">${i + 1} de ${TUTORIAL.length}</div>
      <div class="text-amber-500 font-black italic uppercase text-xl mb-3">${t}</div>
      <p class="text-gray-300 text-sm mb-6">${s}</p>
      <button id="tut-prox" class="btn">${ultimo ? 'Começar' : 'Próximo'}</button>
      <button id="tut-pular" class="text-gray-500 text-xs font-black uppercase mt-4">Pular</button>
    </div>`;
    ov.querySelector('#tut-prox').onclick = () => { if (ultimo) fechar(); else { i++; desenha(); } };
    ov.querySelector('#tut-pular').onclick = fechar;
  };
  desenha();
  document.body.appendChild(ov);
}

// ---------- configurações e equipe de hoje ----------
let configSub = '';
function telaConfig(sub) {
  if (sub !== undefined) configSub = sub;
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Configurações';
  const grande = localStorage.getItem('agencia_texto_grande') === '1';
  const contraste = localStorage.getItem('agencia_contraste') === '1';
  const compacta = localStorage.getItem('agencia_compacta') === '1';
  const item = (act, titulo, desc) => `<button data-act="${act}" class="card p-4 mb-3 w-full text-left block"><div class="text-white font-black italic uppercase text-sm">${titulo}</div><div class="text-gray-500 text-[11px] mt-1">${desc}</div></button>`;
  const grupo = (sub, titulo, desc) => `<button data-act="config-sub" data-sub="${sub}" class="card p-4 mb-3 w-full text-left flex items-center justify-between"><div><div class="text-white font-black italic uppercase text-sm">${titulo}</div><div class="text-gray-500 text-[11px] mt-1">${desc}</div></div><i data-lucide="chevron-right" class="w-5 h-5 text-amber-500"></i></button>`;
  const voltar = `<button data-act="config" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Configurações</button>`;
  const titulo = (t) => `<h2 class="text-amber-500 font-black italic uppercase text-lg mb-3">${t}</h2>`;
  let corpo;
  if (configSub === 'conta') corpo = `${voltar}${titulo('Minha conta')}
    <div class="card p-4 mb-3"><div class="text-[9px] text-gray-500 font-black uppercase mb-1">Agência</div><div class="text-white font-black italic uppercase text-sm truncate">${esc((perfil && perfil.nome) || 'Sem nome')}</div><div class="text-gray-400 text-xs truncate">${esc(email || '')}</div></div>
    ${item('plano', 'Plano de assinatura', 'Em breve')}
    ${item('redefinir-senha', 'Redefinir senha', 'Receba um link no e-mail para trocar a senha')}
    <button data-act="excluir-conta" class="w-full py-4 rounded-xl border border-red-900/50 text-[10px] font-black uppercase text-red-500 mt-4">Excluir minha conta</button>`;
  else if (configSub === 'equipe') corpo = `${voltar}${titulo('Equipe')}
    ${item('equipe-hoje', 'Equipe hoje', 'Andamento de cada promotor no dia')}
    ${item('convites', 'Convites enviados', 'Promotores convidados e situação de cada convite')}
    ${item('marcas-agencia', 'Marcas da agência', 'Cadastrar as marcas que a agência representa')}`;
  else if (configSub === 'relatorios') corpo = `${voltar}${titulo('Relatórios')}
    <div class="card p-4 mb-3"><div class="text-white font-black italic uppercase text-sm">Relatório semanal</div><div class="text-gray-500 text-[11px] mt-1">Enviado por e-mail toda segunda-feira, às 8h, com a equipe, as lojas sem visita e os motivos.</div></div>
    <div class="card p-4 mb-3"><div class="text-white font-black italic uppercase text-sm">Backup semanal</div><div class="text-gray-500 text-[11px] mt-1">Planilha completa enviada por e-mail todo domingo, às 9h.</div></div>`;
  else if (configSub === 'pref') corpo = `${voltar}${titulo('Preferências e ajuda')}
    ${item('texto-alternar', 'Tamanho do texto', grande ? 'Grande (toque para normal)' : 'Normal (toque para grande)')}
    ${item('contraste-alternar', 'Alto contraste', contraste ? 'Ligado (toque para desligar)' : 'Desligado (toque para ligar)')}
    ${item('compacta-alternar', 'Lista compacta', compacta ? 'Ligada (toque para desligar)' : 'Desligada (toque para ligar)')}
    ${item('ativar-notif', 'Notificações no celular', 'Receber aviso quando um promotor pedir aprovação')}
    ${item('instalar', 'Aplicativo', 'Como instalar na tela inicial do celular')}
    <a href="mailto:melobortolato.renan@gmail.com?subject=Agência%20-%20Promotor%20Ajudante" class="card p-4 mb-3 block"><div class="text-white font-black italic uppercase text-sm">Central de atendimento</div><div class="text-gray-500 text-[11px] mt-1">Fale com a Melo Staff por e-mail</div></a>
    ${item('termos', 'Termos de uso', 'Regras de uso do aplicativo')}
    ${item('privacidade', 'Política de privacidade', 'Como os dados são tratados')}`;
  else corpo = `${grupo('conta', 'Minha conta', 'Nome, plano, senha e exclusão')}
    ${grupo('equipe', 'Equipe', 'Equipe hoje, convites e marcas')}
    ${grupo('relatorios', 'Relatórios', 'Relatório semanal e backup')}
    ${grupo('pref', 'Preferências e ajuda', 'Texto, contraste, lista, aplicativo e suporte')}
    <button data-act="sair" class="w-full py-4 rounded-xl border border-red-900/50 text-[10px] font-black uppercase text-red-500 mt-6">Sair da conta</button>
    <p class="text-center text-[10px] text-gray-600 mt-6">Agência · ${VERSAO_AGENCIA}</p>`;
  tela(corpo);
}

function telaEquipeHoje() {
  $('#topo').classList.remove('hidden');
  $('#titulo').textContent = 'Equipe hoje';
  tela(`
    <button data-act="config" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Configurações</button>
    <div id="resumo-equipe"><div class="card p-4 text-gray-500 text-xs">Carregando...</div></div>
    <div class="flex gap-2 mt-3"><button data-act="equipe-hoje" class="flex-1 py-2 rounded-xl border border-amber-500/60 text-amber-500 text-[10px] font-black uppercase">Atualizar</button><button data-act="compartilhar-resumo" class="flex-1 py-2 rounded-xl border border-amber-500/60 text-amber-500 text-[10px] font-black uppercase">Compartilhar</button><button data-act="imprimir-equipe" class="flex-1 py-2 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase">PDF</button></div>`);
  carregarResumo();
}

// ---------- relatório ----------
async function abrirRelatorio(uid) {
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  atual = uid;
  $('#titulo').textContent = p.apelido || p.nome || 'Promotor';
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosFiltrados(uid);
    const hoje = isoLocal(new Date());
    const ini = isoLocal(new Date(Date.now() - 6 * 86400000));
    const dentro = (iso) => !!iso && iso >= ini && iso <= hoje;
    const marcasPromotor = (p.marcas && p.marcas.length) ? p.marcas : [...new Set(d.lojas.flatMap(l => (l.marcas || []).map(m => String(m.nome).trim())).filter(Boolean))];

    const lojasOrdenadas = d.lojas.slice().sort((x, y) => (x.nome || '').localeCompare(y.nome || '', 'pt-BR'));
    const cards = lojasOrdenadas.map(l => {
      const vs = d.visitas.filter(v => v.lojaId === l.id && dentro(v.data)).sort((x, y) => (y.data + (y.hora || '')).localeCompare(x.data + (x.hora || '')));
      const feita = vs.find(v => !v.semVisita && !v.adiadaPara && !v.extra);
      const semV = vs.find(v => v.semVisita && !v.adiadaPara);

      // quantidade retirada por marca do promotor, nesta loja, no período
      const retirado = {};
      d.vencidos.filter(x => x.lojaId === l.id && dentro(x.dataRetirada)).forEach(x => {
        const m = norm(x.marcaNome || x.marca);
        retirado[m] = (retirado[m] || 0) + (Number(x.qtd) || 0);
      });
      const quantidades = marcasPromotor.map(m => `<div class="flex justify-between text-xs py-1 border-b border-gray-800 last:border-0"><span class="text-gray-400">${esc(m)}</span><span class="text-gray-200 font-bold">${retirado[norm(m)] || 0} un.</span></div>`).join('');

      let cor, titulo, corpo;
      if (feita) {
        cor = '#22c55e'; titulo = 'Visitada';
        corpo = `<div class="text-gray-300 text-xs">Visitada em ${dataBR(feita.data)} às ${esc(feita.hora || '')}</div>`;
      } else if (semV) {
        cor = '#ef4444'; titulo = 'Não visitada';
        const prox = proximaDataLoja(l, semV.data);
        corpo = `<div class="text-gray-300 text-xs">Sem visita informada em ${dataBR(semV.data)}${semV.hora ? ' às ' + esc(semV.hora) : ''}</div>
          <div class="text-white font-bold text-sm mt-1">${esc(semV.motivo || 'Sem motivo informado')}</div>
          <div class="text-gray-300 text-xs mt-1">Próxima visita: <b class="text-gray-100">${prox ? dataBR(prox) : 'não definida'}</b></div>`;
      } else {
        cor = '#6b7280'; titulo = 'Sem registro';
        corpo = '<div class="text-gray-500 text-xs">Sem registro de visita no período</div>';
      }
      return `<div class="card p-4 mb-3" style="border-left:4px solid ${cor}">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="text-white font-black italic uppercase text-sm">${esc(l.nome)}</div>
          <span class="text-[9px] font-black uppercase whitespace-nowrap" style="color:${cor}">${titulo}</span>
        </div>
        ${corpo}
        <div class="mt-3">${quantidades || '<div class="text-gray-500 text-xs">Nenhuma marca</div>'}</div>
      </div>`;
    }).join('');

    tela(`
      <button data-act="voltar" class="text-amber-500 text-[11px] font-black uppercase mb-3">← Promotores</button>
      <div class="card p-4 mb-3">
        <div class="text-[9px] text-gray-500 font-black uppercase">Promotor</div>
        <div class="text-white font-black text-lg">${esc(p.nome || '')}</div>
        <div class="text-[9px] text-gray-500 font-black uppercase mt-3">Marcas que atende</div>
        <div class="text-gray-200 text-sm">${marcasPromotor.map(esc).join(' · ') || 'Nenhuma marca'}</div>
        <div class="text-[10px] text-gray-500 mt-2">Período: ${dataBR(ini)} a ${dataBR(hoje)}</div>
      </div>
      ${d.semFiltro ? '<div class="card p-3 mb-3 text-amber-500 text-[11px] font-bold">Este promotor ainda não tem marcas escolhidas. Mostrando tudo. Toque na etiqueta para escolher.</div>' : ''}
      ${cards || '<div class="card p-4 text-gray-500 text-xs mb-3">Nenhuma loja vinculada a essas marcas.</div>'}
      <div class="card p-4 mb-3">
        <div class="text-[9px] text-gray-500 font-black uppercase mb-2">Informativo ao promotor</div>
        ${(p.comentarios || []).length ? `<div class="mb-3">${(p.comentarios || []).slice(-5).reverse().map(c => `<div class="py-2 border-b border-gray-800 last:border-0"><div class="text-[10px] text-gray-500">${esc(new Date(c.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</div><div class="text-gray-200 text-sm">${esc(c.texto)}</div></div>`).join('')}</div>` : '<p class="text-gray-500 text-xs mb-3">Nenhum informativo enviado ainda.</p>'}
        ${p.respostaPromotor ? `<p class="text-amber-500 text-[10px] font-black uppercase mb-1">Resposta do promotor</p><p class="text-gray-200 text-sm mb-3">${esc(p.respostaPromotor)}</p>` : ''}
        <form id="f-comentario" class="space-y-2">
          <textarea name="texto" rows="3" maxlength="500" class="campo" placeholder="Escreva um informativo para o promotor"></textarea>
          <button class="btn-line">Enviar informativo</button>
        </form>
      </div>
      <button data-act="rota" data-uid="${esc(uid)}" class="btn">Ver rota</button>`);
    ligarForm('f-comentario', (e) => salvarComentario(e, uid));
  } catch (e) { console.error(e); tela('<p class="text-red-400 text-sm">Não consegui carregar o relatório.</p>'); }
}

// Próxima data de atendimento da loja, depois de uma data
function proximaDataLoja(l, depoisISO) {
  const dias = diasDaLoja(l);
  if (!dias.length || !depoisISO) return null;
  const [y, m, dd] = depoisISO.split('-').map(Number);
  for (let k = 1; k <= 21; k++) {
    const dt = new Date(y, m - 1, dd + k);
    if (dias.includes(dt.getDay())) return isoLocal(dt);
  }
  return null;
}

async function salvarComentario(e, uid) {
  e.preventDefault();
  const texto = String(new FormData(e.target).get('texto') || '').trim().slice(0, 500);
  if (!texto) return alert('Escreva o informativo antes de enviar.');
  const p = promotores.find(x => x.uid === uid); if (!p) return;
  const historico = [...(p.comentarios || []), { texto, em: new Date().toISOString() }].slice(-50);
  try {
    await updateDoc(doc(db, 'vinculos', email, 'promotores', uid), { comentario: texto, comentarioEm: new Date(), comentarios: historico });
    p.comentario = texto; p.comentarios = historico;
    abrirRelatorio(uid);
  } catch (err) { console.error(err); alert('Não consegui enviar o informativo. Tente de novo.'); }
}

// ---------- rota em calendário ----------
async function abrirRota(uid) { atual = uid; mes = new Date(); await rotaRender(null); }

async function rotaRender(diaSel) {
  const p = promotores.find(x => x.uid === atual); if (!p) return;
  tela('<p class="text-gray-500 text-sm">Carregando...</p>');
  try {
    const d = await dadosFiltrados(atual);
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
    const d = await dadosFiltrados(uid);
    const nomeLoja = (id) => (d.lojas.find(l => l.id === id) || {}).nome || '';
    const linhas = [['VISITAS'], ['Data', 'Hora', 'Loja']];
    d.visitas.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
      .forEach(v => linhas.push([dataBR(v.data), v.hora, v.lojaNome || nomeLoja(v.lojaId)]));
    linhas.push([], ['ENTRADAS (produtos cadastrados)'], ['Data', 'Produto', 'Loja']);
    d.produtos.forEach(x => linhas.push([dataBR(x.dia), x.nome, nomeLoja(x.lojaId)]));
    linhas.push([], ['SAÍDAS (vencidos retirados)'], ['Data retirada', 'Produto', 'Loja', 'Quantidade', 'Validade', 'Motivo']);
    d.vencidos.forEach(x => linhas.push([dataBR(x.dataRetirada), x.nome, nomeLoja(x.lojaId), x.qtd, dataBR(x.dataVenc), x.motivo || '']));
    const csv = '\uFEFF' + linhas.map(r => r.map(c => `"${celulaSegura(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Relatorio - ${p.apelido || p.nome} - ${isoLocal(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { console.error(e); alert('Não consegui gerar a planilha.'); }
}

// ---------- ações ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, uid = b.dataset.uid;
  if (act === 'google') {
    // redirecionamento: não depende de pop-up, que costuma ser bloqueado no celular
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch (err) { console.error(err); telaEntrar('Não consegui entrar com o Google. Código: ' + (err.code || 'desconhecido')); }
  }
  else if (act === 'ir-criar') telaCriar();
  else if (act === 'ir-entrar') telaEntrar();
  else if (act === 'ja-confirmei') {
    await user.reload();
    if (user.emailVerified) handleUser(user); else alert('Ainda não confirmado. Confira seu e-mail (inclusive a caixa de spam).');
  }
  else if (act === 'reenviar') { await sendEmailVerification(user).catch(() => {}); alert('E-mail de confirmação reenviado.'); }
  else if (act === 'sair') { if (confirm('Sair da conta?')) { cache = {}; signOut(auth); } }
  else if (act === 'novo-convite') telaConvidar();
  else if (act === 'relatorio') abrirRelatorio(uid);
  else if (act === 'rota') abrirRota(uid);
  else if (act === 'renomear') renomear(uid);
  else if (act === 'planilha') baixarPlanilha(uid);
  else if (act === 'remover') remover(uid);
  else if (act === 'config') telaConfig('');
  else if (act === 'solicitacoes') telaSolicitacoes();
  else if (act === 'ativar-notif') ativarNotificacoes();
  else if (act === 'sol-aprovar') responderSolicitacao(b.dataset.id, 'aprovada');
  else if (act === 'sol-recusar') responderSolicitacao(b.dataset.id, 'recusada');
  else if (act === 'config-sub') telaConfig(b.dataset.sub);
  else if (act === 'equipe-hoje') telaEquipeHoje();
  else if (act === 'convites') telaConvites();
  else if (act === 'redefinir-senha') resetSenha(email);
  else if (act === 'esqueci') esqueciSenha();
  else if (act === 'trocar-perfil') mostrarEscolhaPerfil();
  else if (act === 'plano') alert('Plano de assinatura: em breve.');
  else if (act === 'contraste-alternar') { const on = localStorage.getItem('agencia_contraste') !== '1'; localStorage.setItem('agencia_contraste', on ? '1' : '0'); document.documentElement.classList.toggle('contraste', on); telaConfig(); }
  else if (act === 'compacta-alternar') { const on = localStorage.getItem('agencia_compacta') !== '1'; localStorage.setItem('agencia_compacta', on ? '1' : '0'); document.body.classList.toggle('compacta', on); telaConfig(); }
  else if (act === 'instalar') alert('No Chrome do celular, toque nos três pontos e em "Adicionar à tela inicial".');
  else if (act === 'termos') window.open('https://promotor-ajudante.vercel.app/termos-de-uso.html', '_blank');
  else if (act === 'privacidade') window.open('https://promotor-ajudante.vercel.app/politica-de-privacidade.html', '_blank');
  else if (act === 'excluir-conta') excluirConta();
  else if (act === 'compartilhar-resumo') compartilharResumo();
  else if (act === 'texto-alternar') { localStorage.setItem('agencia_texto_grande', localStorage.getItem('agencia_texto_grande') === '1' ? '0' : '1'); aplicarTamanhoTexto(); telaConfig(); }
  else if (act === 'imprimir-equipe') imprimirEquipe();
  else if (act === 'reenviar-convite') reenviarConvite(b.dataset.email);
  else if (act === 'remover-convite') removerConvite(b.dataset.email);
  else if (act === 'marcas-agencia') telaMarcasAgencia();
  else if (act === 'marcas-promotor') telaMarcasPromotor(uid);
  else if (act === 'rem-marca') salvarMarcasAgencia(marcasAgencia().filter(m => m !== b.dataset.nome));
  else if (act === 'voz') iniciarVoz();
  else if (act === 'voltar') telaPrincipal();
  else if (act === 'mes') { mes = new Date(mes.getFullYear(), mes.getMonth() + Number(b.dataset.n), 1); rotaRender(null); }
  else if (act === 'dia') rotaRender(b.dataset.dia);
});
