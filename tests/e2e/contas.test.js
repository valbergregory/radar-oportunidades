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

const configJs = (versao = "2026-11-26.2") => `window.RADAR_CONTA = {
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
async function favorito(uid, id) {
  const r = await api(`${DOCS_FS}/perfis/${uid}/favoritos/${id}`);
  return r.status === 200 ? r.json.fields : null;
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
  if ("integerValue" in f) return Number(f.integerValue);
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
      // filtros novos: tipos sem itens "em breve", alcance relativo ao estado, idioma
      await p.goto(SITE); await p.waitForSelector(".cartao");
      ok(await p.evaluate(() => ["estagio", "emprego"].every(t => {
           const c = document.querySelector(`#tipos input[value="${t}"]`);
           return c && c.disabled && c.closest("label").textContent.includes("em breve"); })),
         "filtros: Estágios e Empregos sem itens aparecem desabilitados com \"em breve\"");
      ok((await p.$$eval("#idiomas input", l => l.map(c => c.value))).join() === "pt,en,es,outro", "filtros: Idioma com 4 opções");
      const so = async (uf, alcances) => {
        await p.selectOption("#meu-uf", uf);
        for (const c of await p.$$("#alcances input")) {
          const v = await c.getAttribute("value");
          if (alcances.includes(v) !== await c.isChecked()) await c.click();
        }
        return p.$$eval(".cartao", l => l.map(li => li.querySelector(".orgao, .fonte")?.textContent || li.textContent));
      };
      await p.click("#abrir-filtros");
      const daqui = await so("AL", ["estadual"]);
      ok(daqui.length > 0 && daqui.every(t => /UFAL|FAPEAL/.test(t)), "alcance: AL + Estadual mostra só fontes de Alagoas " + daqui.length);
      ok(await p.locator(".etq-alcance", { hasText: "Estadual (AL)" }).count() > 0, "alcance: cartão mostra \"Estadual (AL)\"");
      const vizinho = await so("SE", ["regional"]);
      ok(vizinho.length === daqui.length, "alcance: SE + Regional mostra os itens de Alagoas (mesma região)");
      const longe = await so("SP", ["estadual", "regional"]);
      ok(longe.length === 0, "alcance: SP + Estadual/Regional não mostra itens de Alagoas");
      const todos = await so("SP", ["estadual", "regional", "nacional", "internacional"]);
      ok(todos.length === dados.itens.filter(i => !i.prazo || i.prazo >= new Date().toISOString().slice(0, 10)).length,
         "alcance: com todos marcados, aparece tudo (inclusive estadual de outra região)");
      ok(await p.evaluate(() => localStorage.getItem("radar-uf")) === '"SP"', "alcance: Meu estado fica guardado no aparelho");
      const inter = await so("", ["internacional"]);
      ok(inter.length === dados.itens.filter(i => i.alcance === "internacional").length && inter.length > 0,
         "alcance: só Internacional mostra os itens internacionais");
      await p.click("#limpar"); await p.keyboard.press("Escape");
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
    // dados.json com alterado_em controlado pelo teste (simula o robô registrando mudança)
    const alterado = {};
    await ctx.route("**/dados.json", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({
      ...dados, itens: dados.itens.map(i => alterado[i.id] ? { ...i, alterado_em: alterado[i.id] } : i) }) }));
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
    await p.check("input[name=termos]");
    await p.click("#botao-criar"); await p.waitForTimeout(400);
    ok((await usuarios()).length === 0 && await p.getAttribute("#grupo-vinculos input", "aria-invalid") === "true" &&
       (await p.textContent("#grupo-vinculos + .erro-campo")).includes("Escolha ao menos uma opção") &&
       await p.getAttribute("#uf", "aria-invalid") === "true",
       "cadastro: \"Você é\" e \"Seu estado\" são obrigatórios, com aviso abaixo do grupo");
    ok(await p.locator("#grupo-vinculos label", { hasText: "Prefiro não informar" }).count() === 1 &&
       await p.locator("#uf option", { hasText: "Prefiro não informar" }).count() === 1,
       "cadastro: os dois têm \"Prefiro não informar\"");
    // mais de uma opção; "Prefiro não informar" desmarca as outras e vice-versa
    const vinc = t => p.locator("#grupo-vinculos label.chip-check", { hasText: t });
    await vinc("Prefiro não informar").click(); await vinc("Docente").click();
    ok(!(await p.isChecked("#grupo-vinculos input[value=nao-informado]")), "cadastro: marcar um vínculo desmarca \"Prefiro não informar\"");
    await vinc("Estudante de pós-graduação").click();
    ok((await p.$$eval("#grupo-vinculos input:checked", l => l.map(c => c.value))).join() === "estudante-pos,docente" &&
       await p.locator("#grupo-vinculos + .erro-campo").count() === 0, "cadastro: dá para ser mais de uma coisa (pós e docente)");
    await p.selectOption("#uf", "AL");
    // formação e perfis acadêmicos (opcionais), aceitando endereço ou identificador
    await p.selectOption("#titulacao", "mestrado");
    await p.fill("input[name=instituicao]", "Universidade Federal de Alagoas");
    await p.fill("#campo-orcid", "0000-0002-1825-0098");
    await p.click("#botao-criar"); await p.waitForTimeout(400);
    ok((await usuarios()).length === 0 && (await p.textContent("#campo-orcid ~ .erro-campo, .erro-campo")).includes("ORCID inválido"),
       "cadastro: ORCID com dígito verificador errado é recusado");
    await p.fill("#campo-orcid", "https://orcid.org/0000-0002-1825-0097");
    await p.fill("#campo-lattes", "http://lattes.cnpq.br/1234567890123456");
    await p.fill("#campo-linkedin", "https://www.linkedin.com/in/pessoa-teste/");
    await p.fill("input[name=nome_exibicao]", "Pessoa");
    await p.check("input[name=termos]");
    await p.click("#botao-criar");
    await p.waitForURL(/personalizar\.html\?nova=1/);
    const [user] = await usuarios();
    ok(user && user.email === "pessoa@exemplo.invalid", "cadastro: conta criada no Authentication");
    const uid = user.localId;
    let pf = await perfil(uid);
    ok(valor(pf.vinculos).join() === "estudante-pos,docente" && valor(pf.titulacao) === "mestrado" &&
       valor(pf.instituicao) === "Universidade Federal de Alagoas" && valor(pf.orcid) === "0000-0002-1825-0097" &&
       valor(pf.lattes) === "1234567890123456" && valor(pf.linkedin) === "pessoa-teste",
       "cadastro: vínculos, titulação, instituição e identificadores ORCID/Lattes/LinkedIn normalizados");
    ok(pf && valor(pf.vinculo) === "estudante-pos" && valor(pf.uf) === "AL" && valor(pf.areas).join() === "economia" && valor(pf.tipos).join() === "bolsa" &&
       valor(pf.quer_newsletter) === false && valor(pf.newsletter_em) === null && valor(pf.termos_versao) === "2026-11-26.2" &&
       !!valor(pf.consentimento_em), "cadastro: perfil gravado com aceite datado e newsletter desligada");
    ok(!JSON.stringify(pf).includes("exemplo.invalid"), "cadastro: e-mail não vai para o Firestore");
    ok((await codigos("VERIFY_EMAIL", "pessoa@exemplo.invalid")).length === 1, "cadastro: e-mail de verificação enviado");
    ok(await espera(p, "Enviamos um e-mail para confirmar"), "cadastro: avisa sobre a verificação");

    // personalizar: sugestão pelo perfil (docente em AL), sem trocar os tipos já escolhidos no cadastro
    await p.waitForSelector("input[name=frequencia]");
    const marcadosEm = nome => p.$$eval(`input[name=${nome}]:checked`, l => l.map(c => c.value).join());
    ok(await p.isVisible("text=Sugerimos estas opções pelo seu perfil. Altere o que quiser."), "personalizar: mostra o aviso da sugestão");
    ok(await marcadosEm("tipo") === "bolsa", "personalizar: tipos escolhidos no cadastro não são trocados pela sugestão");
    ok(await p.locator("label.chip-check:has(input[value=estagio]) .selo-em-breve").count() === 1 &&
       await p.isEnabled("input[name=tipo][value=estagio]"), "personalizar: Estágios com \"em breve\", mas dá para escolher");
    ok(await marcadosEm("alcance") === "estadual,regional,nacional,internacional" && await marcadosEm("idioma") === "pt,en",
       "personalizar: alcance e idioma vêm pré-marcados pela sugestão");
    await p.locator("label.chip-check", { hasText: "Inglês" }).click();
    ok(await marcadosEm("idioma") === "pt", "personalizar: dá para alterar a sugestão");
    await p.click("#restaurar-sugestao");
    ok(await marcadosEm("idioma") === "pt,en" && await marcadosEm("tipo") === "fomento,bolsa,pos-graduacao,evento,competicao",
       "personalizar: Restaurar sugestão volta tipos, alcance e idioma sugeridos");
    await p.locator("label.chip-check", { hasText: "Direito" }).click();
    await p.locator("label.chip-check", { hasText: "Resumo diário" }).click();
    await p.locator("label.chip-check", { hasText: "E-mail" }).click();
    ok((await p.textContent("#contadores")).replace(/\s+/g, "").includes("2áreasdeinteresse"), "personalizar: contadores atualizam");
    await p.click("text=Salvar preferências");
    ok(await espera(p, "Preferências salvas"), "personalizar: confirma o salvamento");
    pf = await perfil(uid);
    ok(valor(pf.areas).join() === "economia,direito" && valor(pf.frequencia) === "diario" && valor(pf.canais).join() === "email",
       "personalizar: preferências gravadas no Firestore");
    ok(valor(pf.tipos).join() === "fomento,bolsa,pos-graduacao,evento,competicao" && valor(pf.alcances).length === 4 &&
       valor(pf.idiomas).join() === "pt,en" && valor(pf.sugestao_aplicada) === "2", "personalizar: alcance, idioma e versão da sugestão gravados");
    await p.reload(); await p.waitForSelector("input[name=frequencia]");
    await p.locator("label.chip-check", { hasText: "Espanhol" }).click(); await p.click("text=Salvar preferências");
    await espera(p, "Preferências salvas");
    await p.reload(); await p.waitForSelector("input[name=frequencia]");
    ok(await p.isHidden("#aviso-sugestao") && await marcadosEm("idioma") === "pt,en,es",
       "personalizar: depois de salvo, a sugestão não substitui as escolhas");
    await p.screenshot({ path: "/tmp/e2e-fb-personalizar.png", fullPage: true }).catch(() => {});

    // index: preferências e favoritos
    await p.goto(SITE); await p.waitForSelector(".estrela");
    ok((await p.$$eval("#areas input:checked", l => l.map(c => c.value))).join() === "economia,direito", "index: preferências viram filtros");
    ok(await p.inputValue("#meu-uf") === "AL" && (await p.$$eval("#idiomas input:checked", l => l.map(c => c.value))).join() === "pt,en,es",
       "index: estado e idiomas do perfil viram filtros");
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

    // acompanhar: liga em uma oportunidade não salva (cria o favorito já acompanhando)
    await p.goto(SITE + "oportunidade.html?id=" + outroId); await p.waitForSelector("#acompanhar");
    await p.check("#acompanhar"); await p.waitForTimeout(600);
    let fv = await favorito(uid, outroId);
    ok(fv && valor(fv.acompanhar) === true && !!valor(fv.visto_em) && !!valor(fv.criado_em), "acompanhar: favorito com acompanhar e visto_em");
    ok(await p.getAttribute("#lugar-favorito button", "aria-pressed") === "true", "acompanhar: também marca como salvo");
    await p.waitForTimeout(1200);
    alterado[outroId] = new Date().toISOString();  // o robô registrou mudança de prazo depois da visita
    await p.goto(SITE); await p.waitForSelector("#acompanhando:not([hidden]) li");
    const sec = await p.textContent("#acompanhando");
    const it2 = dados.itens.find(i => i.id === outroId);
    ok(sec.includes("Acompanhando") && sec.includes(it2.titulo.slice(0, 30)) && /Faltam \d+ dias|Termina|Prazo não informado/.test(sec),
       "index: seção Acompanhando no topo com contagem");
    ok(sec.includes("Mudou desde a sua última visita") && await p.locator(`.cartao[data-id="${outroId}"] .selo-mudou`).count() === 1,
       "index: \"Mudou desde a sua última visita\" na seção e no cartão");
    ok(await p.locator(`.cartao[data-id="${umId}"] .selo-mudou`).count() === 0, "index: favorito sem mudança não tem selo");
    await p.goto(SITE + "oportunidade.html?id=" + outroId); await p.waitForSelector("#acompanhar");
    ok(await p.isVisible(".selo-mudou") && await p.isChecked("#acompanhar") && await p.getAttribute("#acompanhar", "aria-checked") === "true",
       "oportunidade: mostra o selo e o Acompanhar ligado (aria-checked)");
    await p.waitForTimeout(800);
    await p.reload(); await p.waitForSelector("#acompanhar"); await p.waitForTimeout(400);
    ok(await p.locator(".selo-mudou").count() === 0, "oportunidade: depois de visto, o selo some");
    await p.goto(SITE + "conta.html?aba=acompanhando"); await p.waitForSelector(".lista-acompanhando li");
    ok(!/\bnull\b/.test(await p.textContent("#painel")), "conta/acompanhando: nenhum texto \"null\" solto");
    ok(await p.isVisible("text=Outros favoritos") && await p.locator("button:has-text('Adicionar à agenda')").count() === 1,
       "conta/acompanhando: lista com agenda e outros favoritos");
    await p.click("button:has-text('Parar de acompanhar')"); await p.waitForTimeout(600);
    fv = await favorito(uid, outroId);
    ok(valor(fv.acompanhar) === false && (await favoritos(uid)).length === 2, "conta/acompanhando: parar de acompanhar mantém o favorito");
    ok(!/\bnull\b/.test(await p.textContent("#painel")), "conta/acompanhando: sem \"null\" também sem ninguém acompanhado");
    await p.locator(".lista-acompanhando button:has-text('Acompanhar')").first().click(); await p.waitForTimeout(600);
    ok((await favoritos(uid)).length === 2 && await p.locator("button:has-text('Parar de acompanhar')").count() === 1,
       "conta/acompanhando: Acompanhar a partir de outros favoritos");

    // conta
    await p.goto(SITE + "conta.html"); await p.waitForSelector("input[name=nome_exibicao]");
    ok(await p.inputValue("select[name=uf]") === "AL" && await p.inputValue("#campo-lattes") === "http://lattes.cnpq.br/1234567890123456" &&
       await p.getAttribute("#dica-orcid a", "href") === "https://orcid.org/0000-0002-1825-0097",
       "conta/perfil: mostra estado e perfis acadêmicos, com link para abrir");
    await p.fill("#campo-linkedin", ""); await p.selectOption("#titulacao", "doutorado");
    await p.locator("#grupo-vinculos label.chip-check", { hasText: "Pesquisador(a)" }).click();
    await p.click("text=Salvar alterações"); await espera(p, "Dados salvos.");
    pf = await perfil(uid);
    ok(valor(pf.linkedin) === null && valor(pf.titulacao) === "doutorado" && valor(pf.vinculos).join() === "estudante-pos,docente,pesquisador",
       "conta/perfil: altera titulação e vínculos e apaga o LinkedIn");
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
    ok(exp.conta.email === "pessoa@exemplo.invalid" && exp.perfil.nome_exibicao === "Pessoa Teste" && exp.favoritos.length === 2 && exp.favoritos.some(f => f.acompanhar) && exp.favoritos.some(f => f.visto_em) &&
       exp.perfil.uf === "AL" && exp.perfil.idiomas.join() === "pt,en,es" &&
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
    ok((await favoritos(uid)).length === 2 && !!(await perfil(uid)), "excluir: nada é apagado antes de confirmar a senha");
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
      ok(guardadas.nomes.includes("radar-v9"), "service worker: cache na versão radar-v9");
      ok(!guardadas.r.some(u => /(entrar|cadastro|personalizar|conta)\.html|vendor\/|conta-index|acompanhar\.js/.test(u)) &&
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
