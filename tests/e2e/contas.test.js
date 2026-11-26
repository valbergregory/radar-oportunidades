// Teste de ponta a ponta das contas contra os EMULADORES do Firebase (Auth e
// Firestore, com o firestore.rules do repositório). Nada vai para o projeto real.
//
// Rodar a partir de tests/ (precisa de Java, para o emulador do Firestore):
//   npm install && npx playwright install chromium
//   npm run e2e
// (o script sobe os emuladores com o projeto de demonstração "demo-radar").
"use strict";
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORTA = 8771, SITE = `http://127.0.0.1:${PORTA}/`;
const PROJETO = "demo-radar", AUTH = "http://127.0.0.1:9099", FS = "http://127.0.0.1:8080";
const DOCS_FS = `${FS}/v1/projects/${PROJETO}/databases/(default)/documents`;
const DONO = { Authorization: "Bearer owner" };  // emulador: acesso de administrador, ignora as regras
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "ok   - " : "FALHA - ") + msg); if (!cond) falhas++; };

const configJs = (versao = "2026-11-25") => `window.RADAR_CONTA = {
  firebase: { apiKey: "chave-de-teste", authDomain: "${PROJETO}.firebaseapp.com", projectId: "${PROJETO}",
              storageBucket: "", messagingSenderId: "1", appId: "1:1:web:1" },
  controlador: { nome: "Pessoa Responsável", email: "contato@exemplo.invalid" },
  versaoTermos: "${versao}",
  emuladores: { auth: "${AUTH}", firestoreHost: "127.0.0.1", firestorePorta: 8080 },
};`;

// ---------------------------------------------- consultas de administrador
async function api(url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { ...DONO, "Content-Type": "application/json", ...(opcoes.headers || {}) } });
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : null };
}
const limparTudo = () => Promise.all([
  api(`${FS}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" }),
  api(`${AUTH}/emulator/v1/projects/${PROJETO}/accounts`, { method: "DELETE" })]);
async function usuarios() {
  const r = await api(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJETO}/accounts:query`, { method: "POST", body: "{}" });
  return r.json.userInfo || [];
}
async function perfil(uid) {
  const r = await api(`${DOCS_FS}/perfis/${uid}`);
  return r.status === 200 ? r.json.fields : null;
}
async function favoritos(uid) {
  const r = await api(`${DOCS_FS}/perfis/${uid}/favoritos`);
  return (r.json && r.json.documents || []).map(d => d.name.split("/").pop());
}
async function codigos(tipo, email) {
  const r = await api(`${AUTH}/emulator/v1/projects/${PROJETO}/oobCodes`);
  return (r.json.oobCodes || []).filter(c => c.requestType === tipo && (!email || c.email === email));
}
// Monta o endereço que o e-mail de entrada abriria (o continueUrl com o código).
function linkDeEntrada(c) {
  const u = new URL(c.oobLink), destino = new URL(u.searchParams.get("continueUrl"));
  for (const k of ["mode", "oobCode", "apiKey", "lang"]) if (u.searchParams.get(k)) destino.searchParams.set(k, u.searchParams.get(k));
  return destino.href;
}
function valor(f) {
  if (!f) return undefined;
  if ("nullValue" in f) return null;
  if (f.arrayValue) return (f.arrayValue.values || []).map(v => v.stringValue);
  return f.stringValue ?? f.booleanValue ?? f.timestampValue;
}

async function contexto(navegador, { config, largura = 380 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 860 }, acceptDownloads: true, serviceWorkers: "block" });
  if (config) await ctx.route("**/conta-config.js", r => r.fulfill({ contentType: "text/javascript", body: config }));
  const erros = [];
  ctx.on("page", p => {
    p.on("pageerror", e => erros.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/status of 4\d\d|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  });
  ctx.erros = erros;
  return ctx;
}
const espera = (p, texto) => p.waitForSelector(`text=${texto}`, { timeout: 10000 }).then(() => true, () => false);

(async () => {
  const docs = path.resolve(__dirname, "../../docs");
  const servidor = spawn("python3", ["-m", "http.server", String(PORTA), "--bind", "127.0.0.1"], { cwd: docs, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const navegador = await chromium.launch();
  const dados = JSON.parse(fs.readFileSync(path.join(docs, "dados.json"), "utf8"));
  const umId = dados.itens[0].id, outroId = dados.itens[1].id;
  await limparTudo();
  try {
    // ------------------------------------------------- 1. sem configuração
    // (apiKey vazia; independe do docs/conta-config.js real, que já está preenchido)
    {
      const ctx = await contexto(navegador, { config: configJs().replace('apiKey: "chave-de-teste"', 'apiKey: ""') });
      const p = await ctx.newPage();
      const sdk = [];
      p.on("request", r => { if (/vendor\/firebase|googleapis/.test(r.url())) sdk.push(r.url()); });
      await p.goto(SITE); await p.waitForTimeout(700);
      ok(await p.isHidden("#acao-conta"), "sem configuração: index não mostra Entrar");
      ok(await p.isHidden("#aba-salvos") && await p.isHidden("#aba-perfil"), "sem configuração: abas Salvos e Perfil escondidas");
      ok(await p.locator(".cartao").count() > 0, "sem configuração: lista funciona");
      await p.goto(SITE + "entrar.html");
      ok(await espera(p, "Contas ainda não disponíveis"), "sem configuração: entrar.html avisa que contas não estão ativas");
      await p.goto(SITE + "cadastro.html");
      ok(await espera(p, "Contas ainda não disponíveis"), "sem configuração: cadastro.html também");
      await p.goto(SITE + "oportunidade.html?id=" + umId); await p.waitForSelector("#op-titulo"); await p.waitForTimeout(300);
      ok(await p.locator("#lugar-favorito *").count() === 0, "sem configuração: oportunidade sem favoritar");
      ok(sdk.length === 0, "sem configuração: o SDK do Firebase nunca é baixado " + JSON.stringify(sdk));
      await p.goto(SITE + "privacidade.html");
      ok(await p.isVisible("text=As contas ainda não estão ativas."), "sem configuração: política avisa que não há coleta");
      // cartão em 380px: prazo abaixo do título; aba Calendário abre a página
      await p.goto(SITE); await p.waitForSelector(".cartao");
      ok(await p.evaluate(() => { const c = document.querySelector(".cartao");
        return c.querySelector(".prazo").getBoundingClientRect().top >= c.querySelector("h3").getBoundingClientRect().bottom - 2; }),
         "cartão 380px: selo de prazo abaixo do título");
      await p.click('.abas a:has-text("Calendário")'); await p.waitForSelector("#lista-prazos li");
      ok(p.url().endsWith("calendario.html") && (await p.getAttribute("#webcal", "href")).startsWith("webcal://"),
         "calendário: a aba abre a página, com assinatura webcal e lista de prazos");
      ok(ctx.erros.length === 0, "sem configuração: sem erros no console " + JSON.stringify(ctx.erros));
      await ctx.close();
    }

    // ------------------------------------- 1b. sem o arquivo conta-config.js
    {
      const ctx = await navegador.newContext({ serviceWorkers: "block" });
      await ctx.route("**/conta-config.js", r => r.fulfill({ status: 404, body: "" }));
      const p = await ctx.newPage(); const erros = [];
      p.on("pageerror", e => erros.push(e.message));
      await p.goto(SITE); await p.waitForTimeout(600);
      ok(await p.isHidden("#acao-conta") && await p.locator(".cartao").count() > 0, "sem conta-config.js: site funciona sem contas");
      await p.goto(SITE + "entrar.html");
      ok(await espera(p, "Contas ainda não disponíveis") && erros.length === 0, "sem conta-config.js: páginas de conta avisam, sem erros " + JSON.stringify(erros));
      await ctx.close();
    }

    // ------------------------------------------------- 2. fluxo completo
    const ctx = await contexto(navegador, { config: configJs() });
    const p = await ctx.newPage();
    p.on("dialog", d => d.accept());
    await p.goto(SITE); await p.waitForSelector("#acao-conta:not([hidden])");
    ok(await p.textContent("#acao-conta-rotulo") === "Entrar", "com configuração: index mostra Entrar");

    // entrar: asterisco na mesma linha do rótulo e validação sem balão do navegador
    await p.goto(SITE + "entrar.html"); await p.waitForSelector("#email");
    ok(await p.evaluate(() => [...document.querySelectorAll("label.campo > span:first-child")].slice(0, 2).every(s =>
         Math.abs(s.querySelector(".obrigatorio").getBoundingClientRect().top - s.getBoundingClientRect().top) < 4)),
       "entrar: asterisco de obrigatório na mesma linha do rótulo");
    await p.click("#botao-entrar");
    ok((await p.$$eval(".erro-campo", l => l.length)) === 2 && await p.getAttribute("#email", "aria-invalid") === "true" &&
       await p.evaluate(() => document.activeElement.id) === "email", "entrar: erros fixos abaixo dos campos, com foco no primeiro");

    // cadastro
    await p.goto(SITE + "cadastro.html"); await p.waitForSelector("input[name=area]");
    ok(!(await p.isChecked("input[name=quer_newsletter]")), "cadastro: newsletter começa desmarcada");
    await p.fill("input[name=email]", "Pessoa@Exemplo.invalid");
    await p.fill("#senha", "segredo123"); await p.fill("#confirmar", "outra1234");
    await p.click("#botao-criar"); await p.waitForTimeout(500);
    ok((await usuarios()).length === 0, "cadastro: senhas diferentes e termos desmarcados não criam conta");
    await p.fill("#confirmar", "segredo123");
    await p.locator("label.chip-check", { hasText: "Economia" }).click();
    await p.locator("label.chip-check", { hasText: "Bolsas" }).click();
    await p.selectOption("#vinculo", "docente");
    await p.fill("input[name=nome_exibicao]", "Pessoa");
    await p.check("input[name=termos]");
    await p.click("#botao-criar");
    await p.waitForURL(/personalizar\.html\?nova=1/);
    const [user] = await usuarios();
    ok(user && user.email === "pessoa@exemplo.invalid", "cadastro: conta criada no Authentication");
    const uid = user.localId;
    let pf = await perfil(uid);
    ok(pf && valor(pf.vinculo) === "docente" && valor(pf.areas).join() === "economia" && valor(pf.tipos).join() === "bolsa" &&
       valor(pf.quer_newsletter) === false && valor(pf.newsletter_em) === null && valor(pf.termos_versao) === "2026-11-25" &&
       !!valor(pf.consentimento_em), "cadastro: perfil gravado com aceite datado e newsletter desligada");
    ok(!JSON.stringify(pf).includes("exemplo.invalid"), "cadastro: e-mail não vai para o Firestore");
    ok((await codigos("VERIFY_EMAIL", "pessoa@exemplo.invalid")).length === 1, "cadastro: e-mail de verificação enviado");
    ok(await espera(p, "Enviamos um e-mail para confirmar"), "cadastro: avisa sobre a verificação");

    // personalizar
    await p.waitForSelector("input[name=frequencia]");
    await p.locator("label.chip-check", { hasText: "Direito" }).click();
    await p.locator("label.chip-check", { hasText: "Resumo diário" }).click();
    await p.locator("label.chip-check", { hasText: "E-mail" }).click();
    ok((await p.textContent("#contadores")).replace(/\s+/g, "").includes("2áreasdeinteresse"), "personalizar: contadores atualizam");
    await p.click("text=Salvar preferências");
    ok(await espera(p, "Preferências salvas"), "personalizar: confirma o salvamento");
    pf = await perfil(uid);
    ok(valor(pf.areas).join() === "economia,direito" && valor(pf.frequencia) === "diario" && valor(pf.canais).join() === "email",
       "personalizar: preferências gravadas no Firestore");
    await p.screenshot({ path: "/tmp/e2e-fb-personalizar.png", fullPage: true }).catch(() => {});

    // index: preferências e favoritos
    await p.goto(SITE); await p.waitForSelector(".estrela");
    ok((await p.$$eval("#areas input:checked", l => l.map(c => c.value))).join() === "economia,direito", "index: preferências viram filtros");
    await p.click("#abrir-filtros");
    ok(await p.isVisible("#campo-favoritos"), "index: filtro Meus favoritos aparece logado");
    await p.click("#limpar"); await p.keyboard.press("Escape");
    await p.locator(`.cartao[data-id="${umId}"] .estrela`).click(); await p.waitForTimeout(500);
    ok((await favoritos(uid)).includes(umId), "index: estrela grava favorito no Firestore");
    ok(await p.getAttribute(`.cartao[data-id="${umId}"] .estrela`, "aria-pressed") === "true", "index: estrela marcada");
    await p.goto(SITE + "?favoritos=1"); await p.waitForSelector(".estrela");
    ok(await p.locator(".cartao").count() === 1, "index: ?favoritos=1 mostra só os favoritos");
    await p.screenshot({ path: "/tmp/e2e-fb-index.png" }).catch(() => {});

    // oportunidade
    await p.goto(SITE + "oportunidade.html?id=" + outroId); await p.waitForSelector("#lugar-favorito button");
    await p.click("#lugar-favorito button"); await p.waitForTimeout(500);
    ok((await favoritos(uid)).length === 2, "oportunidade: salvar grava favorito");
    await p.click("#lugar-favorito button"); await p.waitForTimeout(500);
    ok((await favoritos(uid)).length === 1, "oportunidade: clicar de novo remove");
    ok(await p.isVisible("text=Antes de continuar") && await p.getAttribute("a:has-text('Acessar portal original')", "target") === "_blank",
       "oportunidade: Antes de continuar e portal original em nova aba");
    const [ics] = await Promise.all([p.waitForEvent("download"), p.click("text=Adicionar prazo ao calendário")]).catch(() => [null]);
    if (ics) ok(fs.readFileSync(await ics.path(), "utf8").includes("BEGIN:VEVENT"), "oportunidade: prazo vira .ics");

    // conta
    await p.goto(SITE + "conta.html"); await p.waitForSelector("input[name=nome_exibicao]");
    ok(await p.isVisible("text=ainda não foi confirmado"), "conta: avisa que o e-mail não foi confirmado");
    await p.fill("input[name=nome_exibicao]", "Pessoa Teste"); await p.click("text=Salvar alterações");
    ok(await espera(p, "Dados salvos."), "conta/perfil: salvo");
    await p.goto(SITE + "conta.html?aba=notificacoes"); await p.waitForSelector("input[name=quer_newsletter]");
    ok(await p.isVisible("text=O envio de alertas e da newsletter começa em breve"), "conta/notificações: aviso de envio em breve");
    await p.check("input[name=quer_newsletter]"); await p.locator("label.chip-check", { hasText: "Só prazos urgentes" }).click();
    await p.click("text=Salvar notificações"); await espera(p, "Preferências de notificação salvas.");
    pf = await perfil(uid);
    ok(valor(pf.quer_newsletter) === true && !!valor(pf.newsletter_em) && valor(pf.frequencia) === "urgentes",
       "conta/notificações: newsletter autorizada com data do servidor");
    await p.goto(SITE + "conta.html?aba=privacidade"); await p.waitForSelector("input[name=quer_newsletter]");
    await p.uncheck("input[name=quer_newsletter]"); await p.click("text=Atualizar consentimentos");
    await espera(p, "Consentimentos atualizados.");
    pf = await perfil(uid);
    ok(valor(pf.quer_newsletter) === false && valor(pf.newsletter_em) === null, "conta/privacidade: retirada zera a data");
    const [download] = await Promise.all([p.waitForEvent("download"), p.click("text=Baixar meus dados")]);
    const exp = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    ok(exp.conta.email === "pessoa@exemplo.invalid" && exp.perfil.nome_exibicao === "Pessoa Teste" && exp.favoritos.length === 1 &&
       exp.perfil.consentimento_em, "conta/privacidade: exportação JSON completa");
    await p.screenshot({ path: "/tmp/e2e-fb-privacidade.png", fullPage: true }).catch(() => {});
    await p.goto(SITE + "conta.html?aba=seguranca"); await p.waitForSelector("input[name=nova]");
    await p.fill("input[name=nova]", "novaSenha456"); await p.fill("input[name=confirmar]", "novaSenha456");
    await p.click("text=Salvar nova senha");
    ok(await espera(p, "Senha alterada."), "conta/segurança: senha trocada");
    await p.click("text=Sair da conta"); await p.waitForURL(/motivo=saiu/);
    ok(await espera(p, "Você saiu da sua conta."), "sair: volta para entrar");

    // login com senha
    await p.fill("#email", "pessoa@exemplo.invalid"); await p.fill("#senha", "segredo123"); await p.click("#botao-entrar");
    ok(await espera(p, "E-mail ou senha incorretos"), "entrar: senha antiga é recusada");
    await p.goto(SITE + "entrar.html?voltar=" + encodeURIComponent("oportunidade.html?id=" + umId));
    await p.fill("#email", "pessoa@exemplo.invalid"); await p.fill("#senha", "novaSenha456"); await p.click("#botao-entrar");
    await p.waitForURL(/oportunidade\.html\?id=/);
    ok(true, "entrar: com a senha nova, volta para a página de origem");
    await p.goto(SITE + "entrar.html?voltar=" + encodeURIComponent("https://golpe.invalid/"));
    await p.waitForURL(u => !u.toString().includes("entrar.html"));
    ok(p.url().startsWith(SITE), "entrar: não redireciona para fora do site");

    // esqueci a senha
    await p.goto(SITE + "conta.html?aba=seguranca"); await p.waitForSelector("text=Sair da conta");
    await p.click("text=Sair da conta"); await p.waitForURL(/motivo=saiu/);
    await p.fill("#email", "pessoa@exemplo.invalid"); await p.click("#esqueci");
    ok(await espera(p, "O link leva para a troca de senha"), "entrar: esqueci a senha dá resposta genérica");
    ok((await codigos("PASSWORD_RESET", "pessoa@exemplo.invalid")).length === 1, "entrar: e-mail de troca de senha enviado");

    // link por e-mail, mesmo aparelho (e-mail guardado)
    await p.click("#botao-link");
    ok(await espera(p, "Abra o link de preferência neste aparelho"), "entrar: link por e-mail enviado");
    const [linkMesmo] = await codigos("EMAIL_SIGNIN", "pessoa@exemplo.invalid");
    ok(linkMesmo && new URL(new URL(linkMesmo.oobLink).searchParams.get("continueUrl")).pathname.endsWith("/entrar.html"),
       "entrar: o link volta para entrar.html");
    await p.goto(linkDeEntrada(linkMesmo)); await p.waitForURL(u => !u.toString().includes("entrar.html"));
    ok(true, "link por e-mail: login concluído em entrar.html");
    await p.waitForSelector("#acao-conta:not([hidden])");
    ok(await p.textContent("#acao-conta-rotulo") === "Minha conta", "link por e-mail: sessão ativa");

    // link por e-mail, outro aparelho (pede o e-mail) e pessoa nova (aceite cria o perfil)
    {
      const c = await contexto(navegador, { config: configJs(), largura: 1280 });
      const q = await c.newPage();
      await q.goto(SITE + "entrar.html"); await q.fill("#email", "nova@exemplo.invalid"); await q.click("#botao-link");
      await espera(q, "Abra o link");
      const [l] = await codigos("EMAIL_SIGNIN", "nova@exemplo.invalid");
      const q2 = await (await contexto(navegador, { config: configJs(), largura: 1280 })).newPage();
      await q2.goto(linkDeEntrada(l)); await q2.waitForSelector("#email-link");
      ok(true, "link em outro aparelho: pede o e-mail para concluir");
      await q2.fill("#email-link", "nova@exemplo.invalid"); await q2.click("text=Concluir entrada");
      await q2.waitForURL(/aceitar=1/);
      ok(await espera(q2, "aceite os Termos de Uso"), "pessoa nova por link: pede o aceite antes de usar a conta");
      const novo = (await usuarios()).find(x => x.email === "nova@exemplo.invalid");
      ok(novo && !(await perfil(novo.localId)), "pessoa nova por link: sem perfil antes do aceite");
      await q2.locator("form.alerta-laranja input[type=checkbox]").first().check();
      await q2.click("text=Aceitar e continuar"); await q2.waitForURL(/personalizar\.html/);
      const pn = await perfil(novo.localId);
      ok(pn && valor(pn.quer_newsletter) === false && !!valor(pn.consentimento_em), "pessoa nova por link: perfil criado com o aceite");
      await q2.screenshot({ path: "/tmp/e2e-fb-desktop.png" }).catch(() => {});
      await c.close(); await q2.context().close();
    }

    // nova versão dos termos
    {
      const c = await contexto(navegador, { config: configJs("2027-01-01"), largura: 1280 });
      const q = await c.newPage();
      await q.goto(SITE + "entrar.html"); await q.fill("#email", "pessoa@exemplo.invalid"); await q.fill("#senha", "novaSenha456");
      await q.click("#botao-entrar"); await q.waitForURL(/aceitar=1/);
      await q.locator("form.alerta-laranja input[type=checkbox]").first().check();
      await q.click("text=Aceitar e continuar"); await q.waitForURL(u => !u.toString().includes("aceitar"));
      ok(valor((await perfil(uid)).termos_versao) === "2027-01-01", "termos: nova versão aceita e datada");
      ok(c.erros.length === 0, "termos: sem erros " + JSON.stringify(c.erros));
      await c.close();
    }

    // excluir: login antigo exige a senha (auth/requires-recent-login)
    await p.clock.install();
    await p.goto(SITE + "conta.html?aba=privacidade"); await p.waitForSelector("text=Excluir minha conta");
    await p.clock.fastForward("10:00");
    await p.click("text=Excluir minha conta");
    await p.check("#titulo-exclusao ~ label input[type=checkbox]");
    await p.click("text=Excluir definitivamente");
    ok(await espera(p, "Por segurança, confirme sua senha"), "excluir: login antigo pede a senha de novo");
    ok((await favoritos(uid)).length === 1 && !!(await perfil(uid)), "excluir: nada é apagado antes de confirmar a senha");
    await p.fill("form.alerta-laranja input[type=password]", "novaSenha456");
    await p.click("text=Confirmar e excluir"); await p.waitForURL(/motivo=excluida/);
    ok(!(await usuarios()).some(x => x.localId === uid) && !(await perfil(uid)) && (await favoritos(uid)).length === 0,
       "excluir: favoritos, perfil e usuário apagados");
    ok(await espera(p, "Sua conta e seus dados foram excluídos."), "excluir: confirmação na tela");
    ok(ctx.erros.length === 0, "fluxo completo: sem erros no console " + JSON.stringify(ctx.erros));
    await ctx.close();

    // ------------------------------------------------ 3. service worker
    {
      const c = await navegador.newContext();
      await c.route("**/conta-config.js", r => r.fulfill({ contentType: "text/javascript", body: configJs() }));
      const q = await c.newPage();
      await q.goto(SITE); await q.evaluate(() => navigator.serviceWorker.ready);
      await q.reload(); await q.goto(SITE + "conta.html"); await q.goto(SITE + "entrar.html"); await q.waitForTimeout(800);
      const guardadas = await q.evaluate(async () => {
        const r = [];
        for (const n of await caches.keys()) for (const k of await (await caches.open(n)).keys()) r.push(new URL(k.url).pathname);
        return { nomes: await caches.keys(), r };
      });
      ok(guardadas.nomes.includes("radar-v6"), "service worker: cache na versão radar-v6");
      ok(!guardadas.r.some(u => /(entrar|cadastro|personalizar|conta)\.html|vendor\/|conta-index/.test(u)) &&
         !guardadas.r.some(u => /googleapis|identitytoolkit/.test(u)),
         "service worker: nada de conta nem do Firebase no cache");
      await c.setOffline(true);
      await q.goto(SITE + "conta.html").catch(() => {});
      ok(await espera(q, "Sem conexão"), "service worker: conta sem internet mostra aviso");
      await q.goto(SITE + "oportunidade.html?id=" + umId); await q.waitForSelector("#op-titulo");
      ok(true, "service worker: oportunidade abre sem internet");
      await c.close();
    }
  } catch (e) {
    console.log("FALHA - exceção: " + e.stack); falhas++;
  } finally {
    await navegador.close(); servidor.kill();
  }
  console.log(falhas ? `\n${falhas} falha(s).` : "\nTodos os testes passaram.");
  process.exit(falhas ? 1 : 0);
})();
