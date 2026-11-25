// Teste de ponta a ponta das contas, com o Supabase SIMULADO no navegador
// (page.route): nada sai para a internet e nenhum projeto real é usado.
//
// Rodar (precisa de Node e do Playwright com o Chromium instalados):
//   python radar.py gerar --perfil valber
//   node tests/e2e/contas.test.js
//
// Cobre: site sem configuração, chave secreta recusada, cadastro, confirmação
// por e-mail, login, link mágico, recuperação, personalização, preferências nos
// filtros, favoritos (index e página da oportunidade), conta (abas), novo aceite
// dos termos, exportação, troca de senha, sair, exclusão e cache do service worker.
"use strict";
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORTA = 8771, SITE = `http://127.0.0.1:${PORTA}/`, SUPA = "https://projeto-teste.supabase.co";
const CHAVE = "sb_publishable_teste";
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "ok   - " : "FALHA - ") + msg); if (!cond) falhas++; };

function configJs({ chave = CHAVE, versao = "2026-11-25" } = {}) {
  return `window.RADAR_CONTA = { url: "${SUPA}", chavePublicavel: "${chave}",
    controlador: { nome: "Pessoa Responsável", email: "contato@exemplo.invalid" }, versaoTermos: "${versao}" };`;
}

// ------------------------------------------------------- Supabase simulado
function criarSupabaseFalso({ confirmarEmail = false } = {}) {
  const db = { usuarios: new Map(), perfis: new Map(), favoritos: [], consent: [], tokens: new Map(), chamadas: [] };
  let seq = 0;
  const agora = () => new Date().toISOString();
  const novoToken = uid => { const t = "tok-" + uid + "-" + (++seq); db.tokens.set(t, uid); return t; };
  const usuarioJson = u => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.confirmado ? u.criado : null, created_at: u.criado, last_sign_in_at: agora(),
    app_metadata: { provider: "email" }, user_metadata: {}, identities: [{ id: u.id, provider: "email" }] });
  const sessao = u => ({ access_token: novoToken(u.id), token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "ref-" + u.id, user: usuarioJson(u) });
  function registrar(uid, finalidade, concedido, versao) {
    db.consent.push({ usuario_id: uid, finalidade, concedido, versao, registrado_em: agora() });
  }
  // Mesmas regras do gatilho criar_perfil_do_usuario / perfis_registrar.
  function criarPerfil(u, m) {
    const p = { id: u.id, nome_exibicao: m.nome_exibicao || null, vinculo: m.vinculo || null, curso_area: m.curso_area || null,
      areas: m.areas || [], tipos: m.tipos || [], frequencia: "semanal", canais: [], quer_newsletter: !!m.quer_newsletter,
      newsletter_em: m.quer_newsletter ? agora() : null, aceita_pesquisa: false, pesquisa_em: null,
      termos_versao: m.termos_versao || null, consentimento_em: m.termos_versao ? agora() : null,
      criado_em: agora(), atualizado_em: agora() };
    db.perfis.set(u.id, p);
    if (p.termos_versao) registrar(u.id, "termos", true, p.termos_versao);
    if (p.quer_newsletter) registrar(u.id, "newsletter", true, p.termos_versao);
  }
  function atualizarPerfil(p, campos) {
    for (const k of ["nome_exibicao", "vinculo", "curso_area", "areas", "tipos", "frequencia", "canais"]) if (k in campos) p[k] = campos[k];
    if ("termos_versao" in campos && campos.termos_versao !== p.termos_versao) {
      p.termos_versao = campos.termos_versao; p.consentimento_em = agora(); registrar(p.id, "termos", true, p.termos_versao);
    }
    for (const [campo, data, fin] of [["quer_newsletter", "newsletter_em", "newsletter"], ["aceita_pesquisa", "pesquisa_em", "pesquisa"]]) {
      if (campo in campos && campos[campo] !== p[campo]) {
        p[campo] = campos[campo]; p[data] = campos[campo] ? agora() : null; registrar(p.id, fin, campos[campo], p.termos_versao);
      }
    }
    p.atualizado_em = agora();
  }

  async function responder(route) {
    const req = route.request(), url = new URL(req.url()), metodo = req.method();
    const json = (status, corpo, cab = {}) => route.fulfill({ status, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", ...cab }, body: corpo === undefined ? "" : JSON.stringify(corpo) });
    if (metodo === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const corpo = req.postData() ? JSON.parse(req.postData()) : null;
    db.chamadas.push({ metodo, caminho: url.pathname + url.search, corpo });
    if (req.headers()["apikey"] !== CHAVE) return json(401, { message: "Invalid API key" });
    const token = (req.headers()["authorization"] || "").replace("Bearer ", "");
    const uid = db.tokens.get(token), u = uid && db.usuarios.get(uid);
    const erro = (status, code, msg) => json(status, { code, error_code: code, msg, message: msg });
    const p = url.pathname;

    if (p === "/auth/v1/signup") {
      if ([...db.usuarios.values()].some(x => x.email === corpo.email)) return json(200, usuarioJson({ id: "falso", email: corpo.email, criado: agora() }));
      if (!corpo.password || corpo.password.length < 8) return erro(422, "weak_password", "Password should be at least 8 characters");
      const novo = { id: "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0"), email: corpo.email, senha: corpo.password,
                     criado: agora(), confirmado: !confirmarEmail };
      db.usuarios.set(novo.id, novo); criarPerfil(novo, corpo.data || {});
      return json(200, confirmarEmail ? usuarioJson(novo) : sessao(novo));
    }
    if (p === "/auth/v1/token") {
      const tipo = url.searchParams.get("grant_type");
      if (tipo === "password") {
        const x = [...db.usuarios.values()].find(v => v.email === corpo.email && v.senha === corpo.password);
        if (!x) return erro(400, "invalid_credentials", "Invalid login credentials");
        if (!x.confirmado) return erro(400, "email_not_confirmed", "Email not confirmed");
        return json(200, sessao(x));
      }
      const x = db.usuarios.get((corpo.refresh_token || "").replace("ref-", ""));
      return x ? json(200, sessao(x)) : erro(400, "refresh_token_not_found", "Invalid Refresh Token");
    }
    if (p === "/auth/v1/otp" || p === "/auth/v1/recover") return json(200, {});
    if (p === "/auth/v1/logout") { if (token) db.tokens.delete(token); return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); }
    if (p === "/auth/v1/user") {
      if (!u) return erro(401, "bad_jwt", "invalid JWT");
      if (metodo === "PUT" && corpo.password) {
        if (corpo.password === u.senha) return erro(422, "same_password", "New password should be different");
        u.senha = corpo.password;
      }
      return json(200, usuarioJson(u));
    }
    if (!u) return json(401, { code: "PGRST301", message: "JWT expired" });

    const objeto = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const lista = (linhas) => objeto ? (linhas.length === 1 ? json(200, linhas[0]) : json(406, { code: "PGRST116", message: "0 rows" })) : json(200, linhas);
    const eq = campo => (url.searchParams.get(campo) || "").replace(/^eq\./, "");
    if (p === "/rest/v1/perfis") {
      const meu = db.perfis.get(uid);
      if (metodo === "GET") return lista(meu && (!eq("id") || eq("id") === uid) ? [meu] : []);
      if (metodo === "PATCH") {
        if (eq("id") !== uid || !meu) return lista([]);
        if (corpo.frequencia && !["diario", "semanal", "urgentes"].includes(corpo.frequencia)) return json(400, { code: "23514", message: "check" });
        atualizarPerfil(meu, corpo);
        return (req.headers()["prefer"] || "").includes("return=representation") ? lista([meu]) : route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      }
    }
    if (p === "/rest/v1/favoritos") {
      if (metodo === "GET") return lista(db.favoritos.filter(f => f.usuario_id === uid && (!eq("item_id") || f.item_id === eq("item_id")))
                                          .map(f => ({ item_id: f.item_id, criado_em: f.criado_em })));
      if (metodo === "POST") {
        const linhas = Array.isArray(corpo) ? corpo : [corpo];
        for (const l of linhas) {
          if (!/^[0-9a-f]{16}$/.test(l.item_id)) return json(400, { code: "23514", message: "check" });
          if (!db.favoritos.some(f => f.usuario_id === uid && f.item_id === l.item_id))
            db.favoritos.push({ usuario_id: uid, item_id: l.item_id, criado_em: agora() });
        }
        return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } });
      }
      if (metodo === "DELETE") {
        db.favoritos = db.favoritos.filter(f => !(f.usuario_id === uid && f.item_id === eq("item_id")));
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      }
    }
    if (p === "/rest/v1/consentimentos") return lista(db.consent.filter(c => c.usuario_id === uid).map(({ usuario_id, ...c }) => c));
    if (p === "/rest/v1/rpc/excluir_minha_conta") {
      db.usuarios.delete(uid); db.perfis.delete(uid);
      db.favoritos = db.favoritos.filter(f => f.usuario_id !== uid); db.consent = db.consent.filter(c => c.usuario_id !== uid);
      for (const [t, id] of db.tokens) if (id === uid) db.tokens.delete(t);
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    return json(404, { message: "rota não simulada: " + metodo + " " + p });
  }
  return { db, responder };
}

async function novoContexto(navegador, { config, supa, largura = 380 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 860 }, acceptDownloads: true, serviceWorkers: "block" });
  if (config) await ctx.route("**/conta-config.js", r => r.fulfill({ contentType: "text/javascript", body: config }));
  if (supa) await ctx.route(SUPA + "/**", r => supa.responder(r));
  const erros = [];
  ctx.on("page", p => {
    p.on("pageerror", e => erros.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) erros.push(m.text()); });
    p.on("dialog", d => d.accept());
  });
  ctx.erros = erros;
  return ctx;
}

(async () => {
  const docs = path.resolve(__dirname, "../../docs");
  const servidor = spawn("python3", ["-m", "http.server", String(PORTA), "--bind", "127.0.0.1"], { cwd: docs, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const navegador = await chromium.launch();
  const dados = JSON.parse(fs.readFileSync(path.join(docs, "dados.json"), "utf8"));
  const umId = dados.itens[0].id, outroId = dados.itens[1].id;
  try {
    // ---------------------------------------------------- 1. sem configuração
    {
      const ctx = await novoContexto(navegador);
      const p = await ctx.newPage();
      const libs = [];
      p.on("request", r => { if (r.url().includes("vendor/")) libs.push(r.url()); });
      await p.goto(SITE); await p.waitForTimeout(600);
      ok(await p.isHidden("#acao-conta"), "sem configuração: index não mostra Entrar");
      ok(await p.isHidden("#aba-salvos") && await p.isHidden("#aba-perfil"), "sem configuração: abas Salvos e Perfil escondidas");
      ok(libs.length === 0, "sem configuração: a biblioteca do Supabase não é baixada no index");
      ok(await p.locator(".cartao").count() > 0, "sem configuração: lista funciona");
      await p.goto(SITE + "entrar.html");
      ok(await p.isVisible("text=Contas ainda não disponíveis"), "sem configuração: entrar.html explica que contas não estão ativas");
      await p.goto(SITE + "oportunidade.html?id=" + umId); await p.waitForSelector("#op-titulo");
      ok(await p.locator("#lugar-favorito *").count() === 0 && libs.length === 0, "sem configuração: oportunidade sem favoritar e sem biblioteca");
      await p.goto(SITE + "privacidade.html");
      ok(await p.isVisible("text=As contas ainda não estão ativas."), "sem configuração: política avisa que não há coleta");
      ok(ctx.erros.length === 0, "sem configuração: sem erros no console " + JSON.stringify(ctx.erros));
      await ctx.close();
    }
    // ----------------------------------------------------- 2. chave secreta
    {
      const ctx = await novoContexto(navegador, { config: configJs({ chave: "sb_secret_naoUse" }) });
      const p = await ctx.newPage();
      await p.goto(SITE + "entrar.html");
      ok(await p.isVisible("text=Contas ainda não disponíveis"), "chave secreta é recusada e contas ficam desligadas");
      await ctx.close();
    }
    // ------------------------------------------------ 3. fluxo completo
    const supa = criarSupabaseFalso();
    const ctx = await novoContexto(navegador, { config: configJs(), supa });
    const p = await ctx.newPage();
    await p.goto(SITE); await p.waitForSelector("#acao-conta:not([hidden])");
    ok(await p.textContent("#acao-conta-rotulo") === "Entrar", "com configuração: index mostra Entrar");
    ok(await p.isVisible("#aba-perfil"), "com configuração: aba Perfil aparece");

    await p.goto(SITE + "cadastro.html"); await p.waitForSelector("input[name=area]");
    ok(!(await p.isChecked("input[name=quer_newsletter]")), "cadastro: newsletter começa desmarcada");
    await p.fill("input[name=email]", "Pessoa@Exemplo.invalid");
    await p.fill("#senha", "segredo123"); await p.fill("#confirmar", "outra1234");
    await p.click("#botao-criar");
    ok(supa.db.chamadas.every(c => !c.caminho.startsWith("/auth/v1/signup")), "cadastro: senhas diferentes e termos desmarcados bloqueiam o envio");
    await p.fill("#confirmar", "segredo123");
    await p.locator("label.chip-check", { hasText: "Economia" }).click();
    await p.locator("label.chip-check", { hasText: "Bolsas" }).click();
    await p.selectOption("#vinculo", "docente");
    await p.check("input[name=termos]");
    await p.screenshot({ path: "/tmp/e2e-cadastro.png", fullPage: true }).catch(() => {});
    await p.click("#botao-criar");
    await p.waitForURL(/personalizar\.html/);
    const inscricao = supa.db.chamadas.find(c => c.caminho.startsWith("/auth/v1/signup")).corpo;
    ok(inscricao.email === "pessoa@exemplo.invalid" && inscricao.data.termos_versao === "2026-11-25" &&
       inscricao.data.quer_newsletter === false && inscricao.data.areas.join() === "economia" &&
       inscricao.data.vinculo === "docente", "cadastro: envia e-mail, aceite e opcionais; newsletter falsa");
    ok(!JSON.stringify(inscricao).includes("segredo123") || inscricao.password === "segredo123", "cadastro: senha só no campo password do Auth");
    const uid = [...supa.db.usuarios.keys()][0];

    // personalizar
    await p.waitForSelector("input[name=frequencia]");
    ok((await p.textContent("#contadores")).includes("1área de interesse"), "personalizar: resumo conta 1 área");
    await p.locator("label.chip-check", { hasText: "Direito" }).click();
    await p.locator("label.chip-check", { hasText: "Resumo diário" }).click();
    await p.locator("label.chip-check", { hasText: "E-mail" }).click();
    ok((await p.textContent("#contadores")).replace(/\s+/g, "").includes("2áreasdeinteresse"), "personalizar: contadores atualizam");
    await p.screenshot({ path: "/tmp/e2e-personalizar.png", fullPage: true }).catch(() => {});
    await p.click("text=Salvar preferências"); await p.waitForSelector(".msg.ok");
    const pf = supa.db.perfis.get(uid);
    ok(pf.areas.join() === "economia,direito" && pf.frequencia === "diario" && pf.canais.join() === "email", "personalizar: preferências gravadas");

    // index com preferências e favoritos
    await p.goto(SITE); await p.waitForSelector(".estrela");
    const marcadas = await p.$$eval("#areas input:checked", l => l.map(c => c.value));
    ok(marcadas.join() === "economia,direito", "index: preferências da conta viram filtros");
    ok(await p.isVisible("#aviso-conta"), "index: avisa que os filtros seguem as preferências");
    await p.click("#abrir-filtros");
    ok(await p.isVisible("#campo-favoritos"), "index: filtro Meus favoritos aparece logado");
    await p.click("#limpar"); await p.keyboard.press("Escape");
    const estrela = p.locator(`.cartao[data-id="${umId}"] .estrela`);
    await estrela.click(); await p.waitForTimeout(300);
    ok(supa.db.favoritos.some(f => f.item_id === umId && f.usuario_id === uid), "index: estrela grava favorito");
    ok(await p.getAttribute(`.cartao[data-id="${umId}"] .estrela`, "aria-pressed") === "true", "index: estrela fica marcada");
    await p.goto(SITE + "?favoritos=1"); await p.waitForSelector(".estrela");
    ok(await p.locator(".cartao").count() === 1, "index: ?favoritos=1 mostra só os favoritos");
    await p.screenshot({ path: "/tmp/e2e-index.png" }).catch(() => {});

    // página da oportunidade
    await p.goto(SITE + "oportunidade.html?id=" + outroId); await p.waitForSelector("#lugar-favorito button");
    await p.click("#lugar-favorito button"); await p.waitForTimeout(300);
    ok(supa.db.favoritos.length === 2, "oportunidade: botão salvar grava favorito");
    await p.click("#lugar-favorito button"); await p.waitForTimeout(300);
    ok(supa.db.favoritos.length === 1, "oportunidade: clicar de novo remove");
    ok(await p.getAttribute("a:has-text('Acessar portal original')", "target") === "_blank", "oportunidade: portal original em nova aba");
    ok(await p.isVisible("text=Antes de continuar"), "oportunidade: seção Antes de continuar");
    await p.screenshot({ path: "/tmp/e2e-oportunidade.png", fullPage: true }).catch(() => {});

    // conta: abas
    await p.goto(SITE + "conta.html"); await p.waitForSelector("input[name=nome_exibicao]");
    await p.fill("input[name=nome_exibicao]", "Pessoa Teste"); await p.click("text=Salvar alterações");
    await p.waitForSelector(".msg.ok");
    ok(supa.db.perfis.get(uid).nome_exibicao === "Pessoa Teste", "conta/perfil: nome salvo");
    await p.goto(SITE + "conta.html?aba=notificacoes"); await p.waitForSelector("input[name=quer_newsletter]");
    ok(await p.isVisible("text=O envio de alertas e da newsletter começa em breve"), "conta/notificações: aviso de envio em breve");
    await p.check("input[name=quer_newsletter]"); await p.locator("label.chip-check", { hasText: "Só prazos urgentes" }).click();
    await p.click("text=Salvar notificações"); await p.waitForSelector(".msg.ok");
    ok(supa.db.perfis.get(uid).quer_newsletter && supa.db.perfis.get(uid).newsletter_em && supa.db.perfis.get(uid).frequencia === "urgentes",
       "conta/notificações: newsletter autorizada com data e frequência salva");
    await p.goto(SITE + "conta.html?aba=privacidade"); await p.waitForSelector("input[name=aceita_pesquisa]");
    await p.check("input[name=aceita_pesquisa]"); await p.uncheck("input[name=quer_newsletter]");
    await p.click("text=Atualizar consentimentos"); await p.waitForSelector(".msg.ok");
    const pp = supa.db.perfis.get(uid);
    ok(pp.aceita_pesquisa && pp.pesquisa_em && !pp.quer_newsletter && pp.newsletter_em === null, "conta/privacidade: consentimentos atualizados");
    await p.screenshot({ path: "/tmp/e2e-privacidade.png", fullPage: true }).catch(() => {});
    const [download] = await Promise.all([p.waitForEvent("download"), p.click("text=Baixar meus dados")]);
    const exportado = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    ok(exportado.conta.email === "pessoa@exemplo.invalid" && exportado.favoritos.length === 1 &&
       exportado.historico_de_consentimentos.length >= 4 && exportado.perfil.nome_exibicao === "Pessoa Teste",
       "conta/privacidade: exportação JSON completa");
    await p.goto(SITE + "conta.html?aba=seguranca"); await p.waitForSelector("input[name=nova]");
    await p.fill("input[name=nova]", "novaSenha456"); await p.fill("input[name=confirmar]", "novaSenha456");
    await p.click("text=Salvar nova senha"); await p.waitForSelector(".msg.ok");
    ok(supa.db.usuarios.get(uid).senha === "novaSenha456", "conta/segurança: senha trocada no Auth");
    await p.click("text=Sair deste aparelho"); await p.waitForURL(/entrar\.html\?motivo=saiu/);
    ok(await p.evaluate(() => !localStorage.getItem("radar-auth")), "sair: sessão local apagada");

    // login
    await p.fill("#email", "pessoa@exemplo.invalid"); await p.fill("#senha", "errada000");
    await p.click("#botao-entrar");
    ok(await p.waitForSelector("text=E-mail ou senha incorretos", { timeout: 5000 }).then(() => true, () => false),
       "entrar: senha errada avisa");
    await p.click("#botao-link"); await p.waitForSelector(".msg.ok");
    const otp = supa.db.chamadas.filter(c => c.caminho.startsWith("/auth/v1/otp")).pop();
    ok(otp && otp.corpo.create_user === false, "entrar: link mágico não cria conta nova");
    await p.click("#esqueci"); await p.waitForSelector(".msg.ok");
    ok(supa.db.chamadas.some(c => c.caminho.startsWith("/auth/v1/recover") && c.caminho.includes("conta.html")),
       "entrar: recuperação aponta para a troca de senha");
    await p.goto(SITE + "entrar.html?voltar=" + encodeURIComponent("oportunidade.html?id=" + umId));
    await p.fill("#email", "pessoa@exemplo.invalid"); await p.fill("#senha", "novaSenha456");
    await p.click("#botao-entrar"); await p.waitForURL(/oportunidade\.html\?id=/);
    ok(true, "entrar: volta para a página de origem");
    await p.goto(SITE + "entrar.html?voltar=" + encodeURIComponent("https://golpe.invalid/"));
    await p.waitForURL(u => !u.toString().includes("entrar.html"));
    ok(p.url().startsWith(SITE), "entrar: não redireciona para fora do site");

    // novo aceite dos termos
    const ctx2 = await novoContexto(navegador, { config: configJs({ versao: "2027-01-01" }), supa, largura: 1280 });
    const p2 = await ctx2.newPage();
    await p2.goto(SITE + "entrar.html");
    await p2.fill("#email", "pessoa@exemplo.invalid"); await p2.fill("#senha", "novaSenha456");
    await p2.click("#botao-entrar"); await p2.waitForURL(/aceitar=1/);
    await p2.waitForSelector("text=Atualizamos os Termos");
    await p2.screenshot({ path: "/tmp/e2e-conta-desktop.png" }).catch(() => {});
    await p2.locator("form.alerta-laranja input[type=checkbox]").check();
    await p2.click("text=Aceitar e continuar"); await p2.waitForURL(u => !u.toString().includes("aceitar"));
    ok(supa.db.perfis.get(uid).termos_versao === "2027-01-01", "termos: nova versão aceita e registrada");
    ok(supa.db.consent.filter(c => c.usuario_id === uid && c.finalidade === "termos").length === 2, "termos: histórico com dois aceites");
    ok(ctx2.erros.length === 0, "nova versão dos termos: sem erros " + JSON.stringify(ctx2.erros));
    await ctx2.close();

    // excluir conta
    await p.goto(SITE + "conta.html?aba=privacidade"); await p.waitForSelector("text=Excluir minha conta");
    await p.click("text=Excluir minha conta"); await p.waitForURL(/motivo=excluida/);
    ok(supa.db.usuarios.size === 0 && supa.db.perfis.size === 0 && supa.db.favoritos.length === 0 && supa.db.consent.length === 0,
       "excluir: usuário, perfil, favoritos e histórico apagados");
    ok(await p.isVisible("text=Sua conta e seus dados foram excluídos."), "excluir: confirmação na tela");
    ok(ctx.erros.length === 0, "fluxo completo: sem erros no console " + JSON.stringify(ctx.erros));
    await ctx.close();

    // ------------------------------------------- 4. confirmação por e-mail
    {
      const supa2 = criarSupabaseFalso({ confirmarEmail: true });
      const c = await novoContexto(navegador, { config: configJs(), supa: supa2 });
      const q = await c.newPage();
      await q.goto(SITE + "cadastro.html"); await q.waitForSelector("input[name=area]");
      await q.fill("input[name=email]", "nova@exemplo.invalid");
      await q.fill("#senha", "segredo123"); await q.fill("#confirmar", "segredo123"); await q.check("input[name=termos]");
      await q.click("#botao-criar"); await q.waitForSelector("text=Confirme seu e-mail");
      ok(true, "cadastro com confirmação: pede para confirmar o e-mail");
      const sinal = supa2.db.chamadas.find(x => x.caminho.startsWith("/auth/v1/signup"));
      ok(sinal.caminho.includes("personalizar.html"), "cadastro com confirmação: link leva a personalizar.html");
      await q.goto(SITE + "entrar.html"); await q.fill("#email", "nova@exemplo.invalid"); await q.fill("#senha", "segredo123");
      await q.click("#botao-entrar"); await q.waitForSelector(".msg");
      ok((await q.textContent(".msg")).includes("Confirme seu e-mail"), "entrar antes de confirmar: explica");
      await c.close();
    }

    // ------------------------------------------------ 5. service worker
    {
      const c = await navegador.newContext();
      await c.route("**/conta-config.js", r => r.fulfill({ contentType: "text/javascript", body: configJs() }));
      await c.route(SUPA + "/**", r => criarSupabaseFalso().responder(r));
      const q = await c.newPage();
      await q.goto(SITE); await q.evaluate(() => navigator.serviceWorker.ready);
      await q.reload(); await q.goto(SITE + "conta.html"); await q.goto(SITE + "entrar.html"); await q.waitForTimeout(500);
      const guardadas = await q.evaluate(async () => {
        const r = [];
        for (const n of await caches.keys()) for (const k of await (await caches.open(n)).keys()) r.push(new URL(k.url).pathname);
        return { nomes: await caches.keys(), r };
      });
      ok(guardadas.nomes.includes("radar-v4"), "service worker: cache na versão radar-v4");
      ok(!guardadas.r.some(u => /(entrar|cadastro|personalizar|conta)\.html|vendor\/|supabase/.test(u)),
         "service worker: nada de conta nem do Supabase no cache " + JSON.stringify(guardadas.r.filter(u => /conta|entrar|vendor/.test(u))));
      await c.setOffline(true);
      await q.goto(SITE + "conta.html").catch(() => {});
      ok(await q.isVisible("text=Sem conexão"), "service worker: conta sem internet mostra aviso");
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
