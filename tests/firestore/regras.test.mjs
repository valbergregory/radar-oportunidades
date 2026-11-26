// Testes de firestore.rules no emulador do Firestore (casos permitidos e negados).
// Rodar a partir de tests/:  npm install && npm run regras
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp, deleteField }
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
await negado("tipo inválido", setDoc(doc(ana, "perfis/ana"), perfilNovo({ tipos: ["estagio"] })));
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
await negado("alterar favorito existente", setDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4"), { criado_em: serverTimestamp() }));
await negado("criar favorito para outra pessoa", setDoc(doc(beto, "perfis/ana/favoritos/xyz"), { criado_em: serverTimestamp() }));
await permitido("listar os próprios favoritos", getDocs(collection(ana, "perfis/ana/favoritos")));
await negado("listar favoritos de outra pessoa", getDocs(collection(beto, "perfis/ana/favoritos")));
await negado("ler favoritos sem login", getDocs(collection(anonimo, "perfis/ana/favoritos")));
await negado("apagar favorito de outra pessoa", deleteDoc(doc(beto, "perfis/ana/favoritos/c931541578c0f7f4")));
await permitido("apagar o próprio favorito", deleteDoc(doc(ana, "perfis/ana/favoritos/c931541578c0f7f4")));

// ---- outras coleções e exclusão
await negado("escrever em outra coleção", setDoc(doc(ana, "outros/x"), { a: 1 }));
await negado("ler outra coleção", getDoc(doc(ana, "outros/x")));
await negado("apagar perfil de outra pessoa", deleteDoc(doc(beto, "perfis/ana")));
await permitido("apagar o próprio perfil", deleteDoc(doc(ana, "perfis/ana")));

await env.cleanup();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTodas as regras se comportaram como esperado.");
process.exit(falhas ? 1 : 0);
