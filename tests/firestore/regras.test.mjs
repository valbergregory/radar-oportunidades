// Testes de firestore.rules no emulador do Firestore (casos permitidos e negados).
// Rodar a partir de tests/:  npm install && npm run regras
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, addDoc, writeBatch, increment, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp, deleteField }
  from "firebase/firestore";

const regras = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");
const env = await initializeTestEnvironment({
  projectId: "demo-radar",
  firestore: { rules: regras, host: "127.0.0.1", port: 8080 },
});

let falhas = 0;
async function caso(nome, promessa) {
  try { await promessa; console.log("ok   - " + nome); }
  catch (e) { falhas++; console.log("FALHA - " + nome + "\n        " + (e.message || e).split("\n")[0]); }
}
const permitido = (nome, p) => caso("permite: " + nome, assertSucceeds(p));
const negado = (nome, p) => caso("nega:    " + nome, assertFails(p));

const perfilNovo = (extra = {}) => ({
  nome_exibicao: "Ana", vinculo: "docente", curso_area: "Economia",
  areas: ["economia"], tipos: ["bolsa"], frequencia: "semanal", canais: ["email"],
  quer_newsletter: false, newsletter_em: null, termos_versao: "2026-11-25",
  consentimento_em: serverTimestamp(), atualizado_em: serverTimestamp(), ...extra,
});

const ana = env.authenticatedContext("ana").firestore();
const beto = env.authenticatedContext("beto").firestore();
const anonimo = env.unauthenticatedContext().firestore();

// ---- criação do perfil
await negado("criar perfil sem login", setDoc(doc(anonimo, "perfis/ana"), perfilNovo()));
await negado("criar perfil de outra pessoa", setDoc(doc(beto, "perfis/ana"), perfilNovo()));
await negado("campo fora da lista (email)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ email: "a@b.c" })));
await negado("texto com mais de 120 caracteres", setDoc(doc(ana, "perfis/ana"), perfilNovo({ nome_exibicao: "x".repeat(121) })));
await negado("lista com mais de 20 itens", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: Array(21).fill("a") })));
await negado("área que não é texto (número)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: ["economia", 42] })));
await negado("área que não é texto (booleano)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: [true] })));
await negado("área que não é texto (nulo)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: ["economia", null] })));
await negado("área com vírgula", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: ["economia,direito"] })));
await negado("área que não é texto (objeto)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: [{ a: 1 }] })));
await negado("áreas somando mais de 800 caracteres", setDoc(doc(ana, "perfis/ana"), perfilNovo({ areas: Array(5).fill("x".repeat(200)) })));
await negado("tipo inválido", setDoc(doc(ana, "perfis/ana"), perfilNovo({ tipos: ["freelance"] })));
await negado("frequência inválida", setDoc(doc(ana, "perfis/ana"), perfilNovo({ frequencia: "horaria" })));
await negado("canal inválido (telegram)", setDoc(doc(ana, "perfis/ana"), perfilNovo({ canais: ["telegram"] })));
await negado("vínculo inválido", setDoc(doc(ana, "perfis/ana"), perfilNovo({ vinculo: "chefe" })));
await negado("newsletter de tipo errado", setDoc(doc(ana, "perfis/ana"), perfilNovo({ quer_newsletter: "sim" })));
await negado("data de aceite forjada", setDoc(doc(ana, "perfis/ana"), perfilNovo({ consentimento_em: Timestamp.fromDate(new Date(2000, 0, 1)) })));
await negado("sem aceite dos termos", setDoc(doc(ana, "perfis/ana"), (({ termos_versao, ...r }) => r)(perfilNovo())));
await negado("newsletter autorizada sem data", setDoc(doc(ana, "perfis/ana"), perfilNovo({ quer_newsletter: true })));
await permitido("criar o próprio perfil válido", setDoc(doc(ana, "perfis/ana"), perfilNovo()));
await permitido("perfil mínimo (só aceite, sem opcionais)", setDoc(doc(beto, "perfis/beto"), {
  areas: [], tipos: [], frequencia: "semanal", canais: [], quer_newsletter: false, newsletter_em: null,
  termos_versao: "2026-11-25", consentimento_em: serverTimestamp(), atualizado_em: serverTimestamp() }));

// ---- leitura
await permitido("ler o próprio perfil", getDoc(doc(ana, "perfis/ana")));
await negado("ler o perfil de outra pessoa", getDoc(doc(beto, "perfis/ana")));
await negado("ler perfil sem login", getDoc(doc(anonimo, "perfis/ana")));
await negado("listar a coleção perfis", getDocs(collection(ana, "perfis")));
await negado("listar perfis sem login", getDocs(collection(anonimo, "perfis")));

// ---- alterações
await permitido("alterar preferências", updateDoc(doc(ana, "perfis/ana"),
  { areas: ["economia", "direito"], frequencia: "diario", atualizado_em: serverTimestamp() }));
await permitido("tipo novo: competições e prêmios", updateDoc(doc(ana, "perfis/ana"),
  { tipos: ["competicao", "evento"], atualizado_em: serverTimestamp() }));
// ---- campos novos do perfil (o perfil de ana foi criado no formato antigo, sem eles)
await permitido("perfil antigo (sem campos novos) continua alterável", updateDoc(doc(ana, "perfis/ana"),
  { nome_exibicao: "Ana Maria", atualizado_em: serverTimestamp() }));
await permitido("tipos estágio e emprego", updateDoc(doc(ana, "perfis/ana"),
  { tipos: ["estagio", "emprego"], atualizado_em: serverTimestamp() }));
await permitido("uf, alcances, idiomas e sugestão", updateDoc(doc(ana, "perfis/ana"),
  { uf: "AL", alcances: ["estadual", "regional", "nacional"], idiomas: ["pt", "en"], sugestao_aplicada: "1",
    atualizado_em: serverTimestamp() }));
await permitido("uf e vínculo 'prefiro não informar'", updateDoc(doc(ana, "perfis/ana"),
  { uf: "nao-informado", vinculo: "nao-informado", atualizado_em: serverTimestamp() }));
await negado("uf inválida", updateDoc(doc(ana, "perfis/ana"), { uf: "XX", atualizado_em: serverTimestamp() }));
await negado("uf minúscula", updateDoc(doc(ana, "perfis/ana"), { uf: "al", atualizado_em: serverTimestamp() }));
await negado("alcance inválido", updateDoc(doc(ana, "perfis/ana"), { alcances: ["mundial"], atualizado_em: serverTimestamp() }));
await negado("mais de 4 alcances", updateDoc(doc(ana, "perfis/ana"),
  { alcances: ["estadual", "regional", "nacional", "internacional", "estadual"], atualizado_em: serverTimestamp() }));
await negado("idioma inválido", updateDoc(doc(ana, "perfis/ana"), { idiomas: ["fr"], atualizado_em: serverTimestamp() }));
await negado("idiomas que não são lista", updateDoc(doc(ana, "perfis/ana"), { idiomas: "pt", atualizado_em: serverTimestamp() }));
await negado("sugestão com mais de 20 caracteres", updateDoc(doc(ana, "perfis/ana"),
  { sugestao_aplicada: "x".repeat(21), atualizado_em: serverTimestamp() }));

// ---- vários vínculos, titulação, instituição, ORCID, Lattes e LinkedIn
const at = c => ({ ...c, atualizado_em: serverTimestamp() });
await permitido("vários vínculos + titulação + instituição + ORCID/Lattes/LinkedIn", updateDoc(doc(ana, "perfis/ana"), at({
  vinculos: ["estudante-pos", "docente"], vinculo: "estudante-pos", titulacao: "mestrado",
  instituicao: "Universidade Federal de Alagoas", orcid: "0000-0002-1825-0097", lattes: "1234567890123456",
  linkedin: "pessoa-teste" })));
await permitido("ORCID com X no fim", updateDoc(doc(ana, "perfis/ana"), at({ orcid: "0000-0002-1694-233X" })));
await permitido("apagar ORCID, Lattes e LinkedIn (nulos)", updateDoc(doc(ana, "perfis/ana"), at({ orcid: null, lattes: null, linkedin: null, titulacao: null, instituicao: null })));
await negado("vínculo inválido na lista", updateDoc(doc(ana, "perfis/ana"), at({ vinculos: ["docente", "chefe"] })));
await negado("mais de 10 vínculos", updateDoc(doc(ana, "perfis/ana"), at({ vinculos: Array(11).fill("docente") })));
await negado("vínculos que não são lista", updateDoc(doc(ana, "perfis/ana"), at({ vinculos: "docente" })));
await negado("titulação inválida", updateDoc(doc(ana, "perfis/ana"), at({ titulacao: "phd" })));
await negado("instituição com mais de 120 caracteres", updateDoc(doc(ana, "perfis/ana"), at({ instituicao: "x".repeat(121) })));
await negado("ORCID em formato errado", updateDoc(doc(ana, "perfis/ana"), at({ orcid: "0000-0002-1825" })));
await negado("ORCID como endereço (só o identificador)", updateDoc(doc(ana, "perfis/ana"), at({ orcid: "https://orcid.org/0000-0002-1825-0097" })));
await negado("Lattes com letras", updateDoc(doc(ana, "perfis/ana"), at({ lattes: "12345678901234AB" })));
await negado("Lattes como endereço", updateDoc(doc(ana, "perfis/ana"), at({ lattes: "http://lattes.cnpq.br/1234567890123456" })));
await negado("LinkedIn como endereço", updateDoc(doc(ana, "perfis/ana"), at({ linkedin: "https://www.linkedin.com/in/pessoa" })));
await negado("LinkedIn com script", updateDoc(doc(ana, "perfis/ana"), at({ linkedin: "<script>" })));
await negado("ORCID que não é texto", updateDoc(doc(ana, "perfis/ana"), at({ orcid: 123 })));
await negado("tipo fora da lista", updateDoc(doc(ana, "perfis/ana"), { tipos: ["freelance"], atualizado_em: serverTimestamp() }));
await permitido("20 áreas de até 30 caracteres (620 no total)", updateDoc(doc(ana, "perfis/ana"),
  { areas: Array.from({ length: 20 }, (_, i) => String(i).padStart(30, "a")), atualizado_em: serverTimestamp() }));
await negado("alterar áreas para mais de 800 caracteres", updateDoc(doc(ana, "perfis/ana"),
  { areas: Array(20).fill("b".repeat(41)), atualizado_em: serverTimestamp() }));
await negado("alterar áreas com item que não é texto", updateDoc(doc(ana, "perfis/ana"),
  { areas: ["economia", true], atualizado_em: serverTimestamp() }));
await negado("alterar sem atualizado_em do servidor", updateDoc(doc(ana, "perfis/ana"), { areas: ["direito"] }));
await negado("alterar perfil de outra pessoa", updateDoc(doc(beto, "perfis/ana"), { areas: [], atualizado_em: serverTimestamp() }));
await negado("autorizar newsletter sem data do servidor", updateDoc(doc(ana, "perfis/ana"),
  { quer_newsletter: true, atualizado_em: serverTimestamp() }));
await permitido("autorizar newsletter com data do servidor", updateDoc(doc(ana, "perfis/ana"),
  { quer_newsletter: true, newsletter_em: serverTimestamp(), atualizado_em: serverTimestamp() }));
await negado("trocar a data da newsletter sem mudar a escolha", updateDoc(doc(ana, "perfis/ana"),
  { newsletter_em: serverTimestamp(), atualizado_em: serverTimestamp() }));
await negado("retirar newsletter mantendo a data", updateDoc(doc(ana, "perfis/ana"),
  { quer_newsletter: false, atualizado_em: serverTimestamp() }));
await permitido("retirar newsletter zerando a data", updateDoc(doc(ana, "perfis/ana"),
  { quer_newsletter: false, newsletter_em: null, atualizado_em: serverTimestamp() }));
await negado("nova versão dos termos sem data nova", updateDoc(doc(ana, "perfis/ana"),
  { termos_versao: "2027-01-01", atualizado_em: serverTimestamp() }));
await permitido("aceitar nova versão dos termos", updateDoc(doc(ana, "perfis/ana"),
  { termos_versao: "2027-01-01", consentimento_em: serverTimestamp(), atualizado_em: serverTimestamp() }));
await negado("forjar a data do aceite sem mudar a versão", updateDoc(doc(ana, "perfis/ana"),
  { consentimento_em: serverTimestamp(), atualizado_em: serverTimestamp() }));
await negado("remover campo obrigatório", updateDoc(doc(ana, "perfis/ana"),
  { tipos: deleteField(), atualizado_em: serverTimestamp() }));

// ---- favoritos
await permitido("criar favorito próprio", setDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { criado_em: serverTimestamp() }));
await negado("favorito com campo extra", setDoc(doc(ana, "perfis/ana/favoritos/0123456789abcdef"), { criado_em: serverTimestamp(), titulo: "x" }));
await negado("favorito com data forjada", setDoc(doc(ana, "perfis/ana/favoritos/0123456789abcdef"), { criado_em: Timestamp.now() }));
for (const [nome, id] of [["id curto", "abc"], ["id com 17 caracteres", "0123456789abcdef0"], ["id com 15 caracteres", "0123456789abcde"],
                          ["id com maiúsculas", "0123456789ABCDEF"], ["id com letra fora do hexadecimal", "0123456789abcdeg"],
                          ["id de 64 caracteres", "a".repeat(64)], ["id com símbolos", "0123456789abc%3C"]]) {
  await negado("favorito com " + nome, setDoc(doc(ana, "perfis/ana/favoritos/" + id), { criado_em: serverTimestamp() }));
}
await permitido("favorito com id do Radar (16 hexadecimais)", setDoc(doc(ana, "perfis/ana/favoritos/0123456789abcdef"), { criado_em: serverTimestamp() }));
await negado("trocar criado_em de um favorito", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { criado_em: serverTimestamp() }));
// ---- acompanhar
await permitido("ligar acompanhar", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { acompanhar: true }));
await permitido("registrar visto_em do servidor", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { visto_em: serverTimestamp() }));
await negado("visto_em forjado", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { visto_em: Timestamp.fromDate(new Date(2030, 0, 1)) }));
await negado("acompanhar que não é booleano", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { acompanhar: "sim" }));
await negado("campo extra no favorito ao alterar", updateDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { nota: "x" }));
await negado("outra pessoa ligar acompanhar", updateDoc(doc(beto, "perfis/ana/favoritos/c931541578c0f7f4"), { acompanhar: false }));
await permitido("criar favorito já acompanhado e visto", setDoc(doc(ana, "perfis/ana/favoritos/fedcba9876543210"),
  { criado_em: serverTimestamp(), acompanhar: true, visto_em: serverTimestamp() }));
await negado("criar favorito com visto_em forjado", setDoc(doc(ana, "perfis/ana/favoritos/0000000000000001"),
  { criado_em: serverTimestamp(), visto_em: Timestamp.now() }));
await negado("criar favorito para outra pessoa", setDoc(doc(beto, "perfis/ana/favoritos/xyz"), { criado_em: serverTimestamp() }));
await permitido("listar os próprios favoritos", getDocs(collection(ana, "perfis/ana/favoritos")));
await negado("listar favoritos de outra pessoa", getDocs(collection(beto, "perfis/ana/favoritos")));
await negado("ler favoritos sem login", getDocs(collection(anonimo, "perfis/ana/favoritos")));
await negado("apagar favorito de outra pessoa", deleteDoc(doc(beto, "perfis/ana/favoritos/c931541578c0f7f4")));
await permitido("apagar o próprio favorito", deleteDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4")));

// ---- outras coleções e exclusão
// ---- sugestões (anônimas, só escrita)
const sug = (extra = {}) => ({ tipo: "ideia", texto: "Mostrar bolsas por curso", nota: 5, pagina: "index.html",
  dispositivo: "celular", instalado: true, versao: "web", criado_em: serverTimestamp(), ...extra });
await permitido("sugestão sem login", addDoc(collection(anonimo, "sugestoes"), sug()));
await permitido("sugestão com login", addDoc(collection(ana, "sugestoes"), sug()));
await permitido("sugestão mínima (tipo, texto, data)", addDoc(collection(anonimo, "sugestoes"),
  { tipo: "problema", texto: "abc", criado_em: serverTimestamp() }));
await permitido("sugestão com nota nula", addDoc(collection(anonimo, "sugestoes"), sug({ nota: null })));
await negado("sugestão com uid ou e-mail (campo fora da lista)", addDoc(collection(ana, "sugestoes"), sug({ uid: "ana" })));
await negado("sugestão com tipo inválido", addDoc(collection(anonimo, "sugestoes"), sug({ tipo: "spam" })));
await negado("sugestão com texto curto", addDoc(collection(anonimo, "sugestoes"), sug({ texto: "ok" })));
await negado("sugestão com mais de 2000 caracteres", addDoc(collection(anonimo, "sugestoes"), sug({ texto: "x".repeat(2001) })));
await negado("sugestão com nota 6", addDoc(collection(anonimo, "sugestoes"), sug({ nota: 6 })));
await negado("sugestão com nota em texto", addDoc(collection(anonimo, "sugestoes"), sug({ nota: "5" })));
await negado("sugestão com data forjada", addDoc(collection(anonimo, "sugestoes"), sug({ criado_em: Timestamp.fromDate(new Date(2000, 0, 1)) })));
await negado("sugestão com dispositivo inválido", addDoc(collection(anonimo, "sugestoes"), sug({ dispositivo: "tv" })));
await negado("ler sugestões (sem login)", getDocs(collection(anonimo, "sugestoes")));
await negado("ler sugestões (com login)", getDocs(collection(ana, "sugestoes")));
await negado("ler uma sugestão pelo id", getDoc(doc(ana, "sugestoes/qualquer")));
await negado("apagar sugestão", deleteDoc(doc(ana, "sugestoes/qualquer")));
await permitido("criar sugestão com id escolhido (é só uma criação)", setDoc(doc(anonimo, "sugestoes/fixa"), sug()));
await negado("alterar sugestão já enviada", setDoc(doc(anonimo, "sugestoes/fixa"), sug({ texto: "trocado" })));

// ---- mural de ideias
const carla = env.authenticatedContext("carla").firestore();
const chefe = env.authenticatedContext("chefe").firestore();
await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "admins/chefe"), { desde: "teste" }));
const ideia = (extra = {}) => ({ titulo: "Filtro por curso", problema: "Hoje não dá para ver só o meu curso.",
  como_deveria: "Um filtro por curso de Penedo.", para_quem: "estudante-graduacao", categoria: "filtro",
  resumo: "Como estudante, quero filtrar por curso.", status: "recebida", apoios: 0,
  criado_em: serverTimestamp(), atualizado_em: serverTimestamp(), ...extra });
function criarIdeia(db, uid, id, dados = ideia()) {
  const b = writeBatch(db);
  b.set(doc(db, "ideias", id), dados);
  b.set(doc(db, "perfis", uid, "minhas_ideias", id), { criado_em: serverTimestamp() });
  return b.commit();
}
function apoiar(db, uid, id, delta = 1, comEspelho = true) {
  const b = writeBatch(db);
  if (delta > 0) {
    b.set(doc(db, "ideias", id, "apoios", uid), { criado_em: serverTimestamp() });
    if (comEspelho) b.set(doc(db, "perfis", uid, "meus_apoios", id), { criado_em: serverTimestamp() });
  } else {
    b.delete(doc(db, "ideias", id, "apoios", uid));
    b.delete(doc(db, "perfis", uid, "meus_apoios", id));
  }
  b.update(doc(db, "ideias", id), { apoios: increment(delta) });
  return b.commit();
}
await negado("ideia sem login", criarIdeia(anonimo, "x", "i0"));
await negado("ideia sem o registro privado de autoria", setDoc(doc(carla, "ideias/i0"), ideia()));
await negado("ideia já com status planejada", criarIdeia(carla, "carla", "i0", ideia({ status: "planejada" })));
await negado("ideia já com apoios", criarIdeia(carla, "carla", "i0", ideia({ apoios: 10 })));
await negado("ideia com resposta da administração", criarIdeia(carla, "carla", "i0", ideia({ resposta: "ok" })));
await negado("ideia com categoria inválida", criarIdeia(carla, "carla", "i0", ideia({ categoria: "spam" })));
await negado("ideia com título curto", criarIdeia(carla, "carla", "i0", ideia({ titulo: "oi" })));
await negado("ideia com problema de mais de 1000 caracteres", criarIdeia(carla, "carla", "i0", ideia({ problema: "x".repeat(1001) })));
await negado("ideia com campo de autor (uid)", criarIdeia(carla, "carla", "i0", ideia({ autor: "carla" })));
await negado("ideia com data forjada", criarIdeia(carla, "carla", "i0", ideia({ criado_em: Timestamp.fromDate(new Date(2000, 0, 1)) })));
await negado("registro de autoria no perfil de outra pessoa", criarIdeia(carla, "beto", "i0"));
await permitido("criar ideia (com autoria privada)", criarIdeia(carla, "carla", "i1"));
await negado("declarar-se autor de ideia alheia", setDoc(doc(beto, "perfis/beto/minhas_ideias/i1"), { criado_em: serverTimestamp() }));
await permitido("quem tem conta lê o mural", getDocs(collection(beto, "ideias")));
await negado("sem login não lê o mural", getDocs(collection(anonimo, "ideias")));
await negado("ler a autoria de outra pessoa", getDocs(collection(beto, "perfis/carla/minhas_ideias")));
await permitido("autora lê as próprias ideias", getDocs(collection(carla, "perfis/carla/minhas_ideias")));
await permitido("autora corrige o texto enquanto recebida", updateDoc(doc(carla, "ideias/i1"),
  { titulo: "Filtro por curso e campus", atualizado_em: serverTimestamp() }));
await negado("outra pessoa altera o texto", updateDoc(doc(beto, "ideias/i1"), { titulo: "Trocado por outro", atualizado_em: serverTimestamp() }));
await negado("autora muda o próprio status", updateDoc(doc(carla, "ideias/i1"), { status: "feita", atualizado_em: serverTimestamp() }));
// apoios
await permitido("apoiar (+1 com o próprio apoio)", apoiar(beto, "beto", "i1"));
await negado("apoiar de novo", apoiar(beto, "beto", "i1"));
await negado("apoio sem o registro privado", apoiar(ana, "ana", "i1", 1, false));
await negado("inflar o contador sem apoio", updateDoc(doc(ana, "ideias/i1"), { apoios: increment(1) }));
await negado("contador +2 com um apoio", (() => { const b = writeBatch(ana);
  b.set(doc(ana, "ideias/i1/apoios/ana"), { criado_em: serverTimestamp() });
  b.set(doc(ana, "perfis/ana/meus_apoios/i1"), { criado_em: serverTimestamp() });
  b.update(doc(ana, "ideias/i1"), { apoios: increment(2) }); return b.commit(); })());
await negado("apoiar em nome de outra pessoa", (() => { const b = writeBatch(ana);
  b.set(doc(ana, "ideias/i1/apoios/carla"), { criado_em: serverTimestamp() });
  b.update(doc(ana, "ideias/i1"), { apoios: increment(1) }); return b.commit(); })());
await negado("ver quem apoiou (listar apoios)", getDocs(collection(carla, "ideias/i1/apoios")));
await negado("ver o apoio de outra pessoa", getDoc(doc(carla, "ideias/i1/apoios/beto")));
await permitido("ver o próprio apoio", getDoc(doc(beto, "ideias/i1/apoios/beto")));
await permitido("retirar o apoio (-1)", apoiar(beto, "beto", "i1", -1));
await negado("retirar apoio que não existe", apoiar(beto, "beto", "i1", -1));
await permitido("apoiar de novo depois de retirar", apoiar(beto, "beto", "i1"));
// administração
await negado("aluna se declara administradora", setDoc(doc(carla, "admins/carla"), { desde: "x" }));
await negado("ver quem é administrador", getDoc(doc(carla, "admins/chefe")));
await permitido("administrador sabe que é", getDoc(doc(chefe, "admins/chefe")));
await permitido("administrador muda status e responde", updateDoc(doc(chefe, "ideias/i1"),
  { status: "planejada", resposta: "Vamos fazer no próximo mês.", atualizado_em: serverTimestamp() }));
await negado("administrador com status inválido", updateDoc(doc(chefe, "ideias/i1"), { status: "talvez", atualizado_em: serverTimestamp() }));
await negado("administrador reescreve o texto da aluna", updateDoc(doc(chefe, "ideias/i1"), { problema: "Outro problema qualquer", atualizado_em: serverTimestamp() }));
await negado("administrador mexe no contador", updateDoc(doc(chefe, "ideias/i1"), { apoios: 99 }));
await negado("autora corrige depois de analisada", updateDoc(doc(carla, "ideias/i1"), { titulo: "Outro título longo", atualizado_em: serverTimestamp() }));
await permitido("criar outra ideia", criarIdeia(carla, "carla", "i2"));
await negado("outra pessoa apaga a ideia", deleteDoc(doc(beto, "ideias/i2")));
await permitido("administrador apaga ideia (moderação)", deleteDoc(doc(chefe, "ideias/i2")));
await permitido("criar ideia para apagar", criarIdeia(carla, "carla", "i3"));
await permitido("apoiar a ideia que será apagada", apoiar(beto, "beto", "i3"));
await permitido("autora apaga a própria ideia", deleteDoc(doc(carla, "ideias/i3")));
await permitido("apoiador remove o apoio que sobrou da ideia apagada", deleteDoc(doc(beto, "ideias/i3/apoios/beto")));
await permitido("autora apaga o próprio registro de autoria", deleteDoc(doc(carla, "perfis/carla/minhas_ideias/i3")));

await negado("escrever em outra coleção", setDoc(doc(ana, "outros/x"), { a: 1 }));
await negado("ler outra coleção", getDoc(doc(ana, "outros/x")));
await negado("apagar perfil de outra pessoa", deleteDoc(doc(beto, "perfis/ana")));
await permitido("apagar o próprio perfil", deleteDoc(doc(ana, "perfis/ana")));

await env.cleanup();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTodas as regras se comportaram como esperado.");
process.exit(falhas ? 1 : 0);
