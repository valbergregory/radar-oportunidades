// Radar de Oportunidades: acesso ao Firebase (Authentication + Firestore).
// O SDK (cópia fixada em ../vendor/firebase-13.2.0/) só é baixado quando
// conta-config.js está preenchido. Nada aqui usa recursos pagos nem chaves de
// conta de serviço: só a configuração pública do app da Web.
const VERSAO = "13.2.0";
const BASE = new URL(`../vendor/firebase-${VERSAO}/`, import.meta.url).href;

const cfg = window.RADAR_CONTA || {};
const fb = cfg.firebase || {};
// Contas ligadas só com a configuração do app da Web completa (apiKey vazia = desligadas).
export const configurado = !!(fb.apiKey && fb.projectId && fb.appId && fb.authDomain);
export const VERSAO_TERMOS = cfg.versaoTermos || "1";

let F = null;  // módulos e instâncias, carregados sob demanda
let iniciando = null;  // uma só inicialização, mesmo com chamadas ao mesmo tempo

export function iniciar() {
  if (!configurado) return Promise.resolve(null);
  if (F) return Promise.resolve(F);
  if (!iniciando) {
    iniciando = carregar().catch(e => { iniciando = null; throw e; });  // falhou: a próxima chamada tenta de novo
  }
  return iniciando;
}

async function carregar() {
  const [app, auth, fs] = await Promise.all([
    import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]);
  const aplicativo = app.initializeApp(fb);
  const a = auth.getAuth(aplicativo);
  a.languageCode = "pt-BR";
  const db = fs.getFirestore(aplicativo);
  // Só nos testes (o arquivo de produção não tem "emuladores").
  if (cfg.emuladores) {
    auth.connectAuthEmulator(a, cfg.emuladores.auth, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, cfg.emuladores.firestoreHost, cfg.emuladores.firestorePorta);
  }
  F = { auth: a, db, A: auth, S: fs };
  return F;
}

// Usuário atual, depois de o SDK restaurar a sessão guardada.
export async function usuario() {
  const f = await iniciar();
  if (!f) return null;
  await f.auth.authStateReady();
  return f.auth.currentUser;
}

// --------------------------------------------------------------- sugestões
// Anônima: sem uid, e-mail ou qualquer identificador (ver firestore.rules).
export async function enviarSugestao(campos) {
  const f = await iniciar();
  if (!f) throw new Error("contas desligadas");
  const ok = ["tipo", "texto", "nota", "pagina", "dispositivo", "instalado"];
  const doc = Object.fromEntries(ok.filter(k => k in campos).map(k => [k, campos[k]]));
  doc.versao = "web";
  doc.criado_em = f.S.serverTimestamp();
  await f.S.addDoc(f.S.collection(f.db, "sugestoes"), doc);
}

// ------------------------------------------------------------------ perfil
const refPerfil = (f, uid) => f.S.doc(f.db, "perfis", uid);
const refFavoritos = (f, uid) => f.S.collection(f.db, "perfis", uid, "favoritos");

export async function lerPerfil(uid) {
  const f = await iniciar();
  const s = await f.S.getDoc(refPerfil(f, uid));
  return s.exists() ? s.data() : null;
}

// Cria o perfil com o aceite dos termos (datas do servidor; ver firestore.rules).
export async function criarPerfil(uid, campos) {
  const f = await iniciar(), agora = f.S.serverTimestamp();
  const perfil = {
    areas: [], tipos: [], frequencia: "semanal", canais: [], ...limpar(campos),
    quer_newsletter: !!campos.quer_newsletter,
    newsletter_em: campos.quer_newsletter ? agora : null,
    termos_versao: VERSAO_TERMOS, consentimento_em: agora, atualizado_em: agora,
  };
  await f.S.setDoc(refPerfil(f, uid), perfil);
}

// Altera o perfil. Mudanças de newsletter e de termos levam a data do servidor.
export async function alterarPerfil(uid, campos, antes) {
  const f = await iniciar(), agora = f.S.serverTimestamp();
  const dados = { ...limpar(campos), atualizado_em: agora };
  if ("quer_newsletter" in campos && antes && campos.quer_newsletter !== antes.quer_newsletter) {
    dados.newsletter_em = campos.quer_newsletter ? agora : null;
  }
  if (campos.termos_versao && antes && campos.termos_versao !== antes.termos_versao) dados.consentimento_em = agora;
  await f.S.updateDoc(refPerfil(f, uid), dados);
}

// Só os campos que o perfil aceita; textos vazios viram null.
function limpar(c) {
  const ok = ["nome_exibicao", "vinculo", "curso_area", "areas", "tipos", "frequencia", "canais",
              "quer_newsletter", "termos_versao", "uf", "alcances", "idiomas", "sugestao_aplicada",
              "vinculos", "titulacao", "instituicao", "orcid", "lattes", "linkedin"];
  const r = {};
  for (const k of ok) if (k in c) r[k] = typeof c[k] === "string" ? (c[k].trim().slice(0, 120) || null) : c[k];
  return r;
}

// --------------------------------------------------------------- favoritos
export async function listarFavoritos(uid) {
  const f = await iniciar();
  const s = await f.S.getDocs(refFavoritos(f, uid));
  return s.docs.map(d => ({ item_id: d.id, ...d.data() }));  // criado_em, acompanhar?, visto_em?
}
// visto: a pessoa está vendo o item agora (página da oportunidade) — grava visto_em.
// acompanhar: já salva acompanhando (mostra em "Acompanhando" e avisa mudanças).
export async function favoritar(uid, itemId, { visto = false, acompanhar = false } = {}) {
  const f = await iniciar(), agora = f.S.serverTimestamp();
  const doc = { criado_em: agora };
  if (visto) doc.visto_em = agora;
  if (acompanhar) doc.acompanhar = true;
  await f.S.setDoc(f.S.doc(refFavoritos(f, uid), itemId), doc);
}
export async function definirAcompanhar(uid, itemId, acompanhar) {
  const f = await iniciar();
  await f.S.updateDoc(f.S.doc(refFavoritos(f, uid), itemId), { acompanhar: !!acompanhar });
}
export async function marcarVisto(uid, itemId) {
  const f = await iniciar();
  await f.S.updateDoc(f.S.doc(refFavoritos(f, uid), itemId), { visto_em: f.S.serverTimestamp() });
}
export async function desfavoritar(uid, itemId) {
  const f = await iniciar();
  await f.S.deleteDoc(f.S.doc(refFavoritos(f, uid), itemId));
}

// ------------------------------------------------------------------- conta
export const urlPagina = pagina => new URL(pagina, location.href).href;
const CHAVE_EMAIL_LINK = "radar-email-link";

export async function entrarComSenha(email, senha) {
  const f = await iniciar();
  return (await f.A.signInWithEmailAndPassword(f.auth, email, senha)).user;
}

export async function criarConta(email, senha) {
  const f = await iniciar();
  return (await f.A.createUserWithEmailAndPassword(f.auth, email, senha)).user;
}

export async function enviarVerificacao(user) {
  const f = await iniciar();
  await f.A.sendEmailVerification(user, { url: urlPagina("personalizar.html") });
}

// Link de entrada: volta para entrar.html (que conclui o login).
export async function enviarLink(email, voltar) {
  const f = await iniciar();
  const destino = urlPagina("entrar.html" + (voltar && voltar !== "./" ? "?voltar=" + encodeURIComponent(voltar) : ""));
  await f.A.sendSignInLinkToEmail(f.auth, email, { url: destino, handleCodeInApp: true });
  try { localStorage.setItem(CHAVE_EMAIL_LINK, email); } catch (e) { /* sem armazenamento: o e-mail será pedido */ }
}
export async function ehLinkDeEntrada() {
  const f = await iniciar();
  return !!f && f.A.isSignInWithEmailLink(f.auth, location.href);
}
export function emailDoLink() {
  try { return localStorage.getItem(CHAVE_EMAIL_LINK); } catch (e) { return null; }
}
export async function concluirLink(email) {
  const f = await iniciar();
  const r = await f.A.signInWithEmailLink(f.auth, email, location.href);
  try { localStorage.removeItem(CHAVE_EMAIL_LINK); } catch (e) { /* ok */ }
  return r.user;
}

export async function recuperarSenha(email) {
  const f = await iniciar();
  await f.A.sendPasswordResetEmail(f.auth, email, { url: urlPagina("entrar.html") });
}

let reautenticadoEm = 0;
export async function reautenticar(senha) {
  const f = await iniciar(), u = f.auth.currentUser;
  await f.A.reauthenticateWithCredential(u, f.A.EmailAuthProvider.credential(u.email, senha));
  reautenticadoEm = Date.now();
}

export async function trocarSenha(nova) {
  const f = await iniciar();
  await f.A.updatePassword(f.auth.currentUser, nova);
}

export async function sair() {
  const f = await iniciar();
  if (f) await f.A.signOut(f.auth);
}

// Exclusão (LGPD): favoritos, depois o perfil, depois o usuário. Pede login
// recente antes de apagar qualquer coisa, para não deixar a conta pela metade.
export async function excluirConta(senha) {
  const f = await iniciar(), u = f.auth.currentUser;
  if (senha) await reautenticar(senha);
  // O Firebase só apaga o usuário com login recente (cerca de 5 minutos).
  // Confere antes, para não apagar os dados e falhar em apagar a conta.
  const desde = Date.now() - Math.max(reautenticadoEm, Date.parse(u.metadata.lastSignInTime || 0) || 0);
  if (!senha && !(desde < 4 * 60 * 1000)) {
    throw Object.assign(new Error("login recente necessário"), { code: "auth/requires-recent-login" });
  }
  const favs = await f.S.getDocs(refFavoritos(f, u.uid));
  for (let i = 0; i < favs.docs.length; i += 400) {
    const lote = f.S.writeBatch(f.db);
    for (const d of favs.docs.slice(i, i + 400)) lote.delete(d.ref);
    await lote.commit();
  }
  await f.S.deleteDoc(refPerfil(f, u.uid));
  await f.A.deleteUser(u);
}

// Exportação (LGPD): tudo o que existe sobre a pessoa, em JSON.
export async function exportar() {
  const f = await iniciar(), u = f.auth.currentUser;
  const iso = v => v && typeof v.toDate === "function" ? v.toDate().toISOString() : v;
  const perfil = await lerPerfil(u.uid);
  const favoritos = (await listarFavoritos(u.uid)).map(x => ({ item_id: x.item_id, criado_em: iso(x.criado_em),
    acompanhar: !!x.acompanhar, visto_em: iso(x.visto_em) || null }));
  let filtros = null, uf = null;
  try { filtros = JSON.parse(localStorage.getItem("radar-filtros")); } catch (e) { /* ok */ }
  try { uf = JSON.parse(localStorage.getItem("radar-uf")); } catch (e) { /* ok */ }
  return {
    gerado_em: new Date().toISOString(),
    conta: { uid: u.uid, email: u.email, email_verificado: u.emailVerified,
             criada_em: u.metadata.creationTime, ultimo_acesso: u.metadata.lastSignInTime },
    perfil: perfil && Object.fromEntries(Object.entries(perfil).map(([k, v]) => [k, iso(v)])),
    favoritos,
    neste_aparelho: { filtros, meu_estado: uf },
  };
}

// --------------------------------------------------------------- mensagens
export function traduzErro(e) {
  const c = (e && e.code) || "";
  const m = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Confira o e-mail digitado.",
    "auth/email-already-in-use": "Já existe uma conta com este e-mail. Entre ou use “Esqueci minha senha”.",
    "auth/weak-password": "Senha fraca. Use pelo menos 8 caracteres, com letras e números.",
    "auth/password-does-not-meet-requirements": "A senha não atende às regras: pelo menos 8 caracteres, com letras e números.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    "auth/network-request-failed": "Sem conexão. Tente de novo quando estiver on-line.",
    "auth/requires-recent-login": "Por segurança, confirme sua senha para continuar.",
    "auth/invalid-action-code": "Este link já foi usado ou expirou. Peça um novo.",
    "auth/expired-action-code": "Este link expirou. Peça um novo.",
    "auth/user-disabled": "Esta conta está desativada.",
    "auth/operation-not-allowed": "Este modo de entrada não está ativado.",
    // Sessão vencida ou regras do banco diferentes das do site (publicação fora de ordem).
    "permission-denied": "O banco de dados recusou esta gravação. Saia e entre de novo; se continuar, " +
      "avise quem cuida do Radar (as regras do banco podem estar desatualizadas).",
    "unavailable": "Sem conexão com o banco de dados. Tente de novo em instantes.",
  };
  return m[c] || "Não foi possível concluir agora. Tente de novo em instantes.";
}

// Cabeçalho e abas: "Entrar" ou "Minha conta"; Salvos e Perfil só com contas.
export async function montarTopo() {
  if (!configurado) return null;
  const u = await usuario();
  const pagina = location.pathname.split("/").pop() + location.search;
  const botao = document.getElementById("acao-conta");
  if (botao) {
    botao.hidden = false;
    botao.href = u ? "conta.html" : "entrar.html?voltar=" + encodeURIComponent(pagina || "./");
    const r = document.getElementById("acao-conta-rotulo");
    if (r) r.textContent = u ? "Minha conta" : "Entrar";
  }
  const salvos = document.getElementById("aba-salvos"), perfil = document.getElementById("aba-perfil");
  if (salvos) { salvos.hidden = false; salvos.href = u ? "./?favoritos=1" : "entrar.html?voltar=" + encodeURIComponent("./?favoritos=1"); }
  if (perfil) { perfil.hidden = false; perfil.href = u ? "conta.html" : "entrar.html"; }
  return u;
}

// Página que exige login: manda para entrar.html e volta depois.
export async function exigirLogin() {
  const u = await usuario();
  if (!u) {
    const pagina = location.pathname.split("/").pop() + location.search;
    location.replace("entrar.html?voltar=" + encodeURIComponent(pagina || "./"));
  }
  return u;
}
