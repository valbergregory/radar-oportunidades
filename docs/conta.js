// Radar de Oportunidades: entrada (código por e-mail) e cadastro opcional.
// Só é carregado quando config/app.yaml tem controlador e Supabase preenchidos.
// Fala direto com as APIs REST do Supabase (Auth e PostgREST), sem biblioteca.
// A proteção dos dados está nas regras do banco: supabase/schema.sql.
"use strict";
(() => {
  const radar = window.radar;
  const CFG = radar && radar.config;
  if (!CFG || !CFG.cadastro || !CFG.supabase) return;
  const BASE = CFG.supabase.url, CHAVE_API = CFG.supabase.chave_publica;
  const CHAVE_SESSAO = "radar-sessao";

  const VINCULOS = {
    "estudante-graduacao": "Estudante de graduação",
    "estudante-pos": "Estudante de pós-graduação",
    "estudante-medio-tecnico": "Estudante de ensino médio ou técnico",
    "docente": "Docente",
    "tecnico-administrativo": "Técnico(a)-administrativo(a)",
    "pesquisador": "Pesquisador(a)",
    "egresso": "Egresso(a)",
    "comunidade": "Comunidade externa",
    "outro": "Outro",
  };
  const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
               "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

  const $ = id => document.getElementById(id);
  const janela = $("janela-conta"), corpo = $("conta-corpo");
  let perfil = null, emailPendente = "";

  // ------------------------------------------------------------ armazenamento
  function lerSessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch (e) { return null; }
  }
  function gravarSessao(s) {
    try {
      if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
      else localStorage.removeItem(CHAVE_SESSAO);
    } catch (e) { /* sem armazenamento: a sessão dura só até fechar a página */ }
    sessaoMemoria = s;
  }
  let sessaoMemoria = lerSessao();

  // ----------------------------------------------------------------- rede
  class ErroConta extends Error {
    constructor(mensagem, status) { super(mensagem); this.status = status; }
  }

  function mensagemErro(status, dados, caminho) {
    if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (caminho.startsWith("/auth/v1/verify")) return "Código inválido ou expirado. Confira ou peça um novo.";
    if (status === 401 || status === 403) return "Sua sessão terminou. Entre de novo.";
    const texto = dados && (dados.msg || dados.message || dados.error_description);
    return "Não foi possível concluir agora" + (texto ? " (" + texto + ")" : "") + ".";
  }

  async function pedir(caminho, { metodo = "GET", corpo: dados, sessao = null, prefer } = {}) {
    const cabecalhos = { apikey: CHAVE_API, "Content-Type": "application/json" };
    if (sessao) cabecalhos.Authorization = "Bearer " + sessao.access_token;
    if (prefer) cabecalhos.Prefer = prefer;
    let resposta;
    try {
      resposta = await fetch(BASE + caminho, {
        method: metodo, headers: cabecalhos,
        body: dados === undefined ? undefined : JSON.stringify(dados),
      });
    } catch (e) {
      throw new ErroConta("Sem conexão. Tente de novo quando estiver on-line.", 0);
    }
    const texto = await resposta.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch (e) { /* resposta sem JSON */ }
    if (!resposta.ok) throw new ErroConta(mensagemErro(resposta.status, json, caminho), resposta.status);
    return json;
  }

  function guardarTokens(d) {
    const agora = Math.floor(Date.now() / 1000);
    gravarSessao({
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: d.expires_at || agora + (d.expires_in || 3600),
      user: { id: d.user.id, email: d.user.email },
    });
  }

  async function sessaoValida() {
    const s = sessaoMemoria;
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      guardarTokens(await pedir("/auth/v1/token?grant_type=refresh_token",
                                { metodo: "POST", corpo: { refresh_token: s.refresh_token } }));
      return sessaoMemoria;
    } catch (e) {
      if (e.status) gravarSessao(null);  // sem rede, mantém para tentar depois
      return null;
    }
  }

  async function rest(caminho, opcoes = {}) {
    const s = await sessaoValida();
    if (!s) throw new ErroConta("Sua sessão terminou. Entre de novo.", 401);
    return pedir("/rest/v1/" + caminho, { ...opcoes, sessao: s });
  }

  // ------------------------------------------------------------- operações
  const enviarCodigo = email =>
    pedir("/auth/v1/otp", { metodo: "POST", corpo: { email, create_user: true } });

  async function confirmarCodigo(email, token) {
    guardarTokens(await pedir("/auth/v1/verify", { metodo: "POST", corpo: { type: "email", email, token } }));
  }

  async function carregarPerfil() {
    const linhas = await rest("perfis?select=*&id=eq." + sessaoMemoria.user.id);
    perfil = linhas && linhas[0] || null;
    return perfil;
  }

  async function salvarPerfil(campos) {
    const id = sessaoMemoria.user.id;
    const linhas = perfil
      ? await rest("perfis?id=eq." + id, { metodo: "PATCH", corpo: campos, prefer: "return=representation" })
      : await rest("perfis", { metodo: "POST", corpo: { id, ...campos }, prefer: "return=representation" });
    perfil = linhas[0];
  }

  async function sair() {
    const s = sessaoMemoria;
    gravarSessao(null); perfil = null;
    if (s) pedir("/auth/v1/logout", { metodo: "POST", sessao: s }).catch(() => {});
  }

  async function excluirConta() {
    await rest("rpc/excluir_minha_conta", { metodo: "POST", corpo: {} });
    gravarSessao(null); perfil = null;
  }

  async function baixarDados() {
    const consentimentos = await rest("consentimentos?select=finalidade,concedido,versao,registrado_em&order=registrado_em");
    const copia = {
      gerado_em: new Date().toISOString(),
      email: sessaoMemoria.user.email,
      perfil: await carregarPerfil(),
      historico_de_consentimentos: consentimentos,
      neste_aparelho: { filtros: localStorage.getItem("radar-filtros") },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "meus-dados-radar-de-oportunidades.json";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Filtros: com conta e cadastro feito, cada mudança é guardada (com atraso
  // para juntar vários cliques em um só envio).
  let atrasoFiltros = null;
  radar.aoMudarFiltros(() => {
    if (!perfil || !sessaoMemoria) return;
    clearTimeout(atrasoFiltros);
    atrasoFiltros = setTimeout(() => {
      const { areas, tipos } = radar.interesses();
      salvarPerfil({ areas_interesse: areas, tipos_interesse: tipos }).catch(() => {});
    }, 1500);
  });

  // ------------------------------------------------------------- interface
  function el(tag, atributos = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) {
      if (v === false || v == null) continue;
      if (k === "texto") e.textContent = v;
      else if (k in e && typeof v !== "string") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...filhos.filter(f => f != null));
    return e;
  }

  function aviso(texto, ok = false) {
    const m = $("conta-msg");
    m.textContent = texto || "";
    m.className = "msg" + (ok ? " ok" : "");
    m.hidden = !texto;
  }

  function titulo(t) { $("conta-titulo").textContent = t; }

  function atualizarBotao() {
    $("entrar").hidden = false;
    $("entrar-rotulo").textContent = sessaoMemoria && perfil ? "Minha conta" : "Entrar";
  }

  async function ocupado(botao, tarefa) {
    botao.disabled = true;
    aviso("");
    try { await tarefa(); } catch (e) { aviso(e.message || "Algo deu errado. Tente de novo."); }
    finally { botao.disabled = false; }
  }

  function telaEmail() {
    titulo("Entrar");
    const email = el("input", { type: "email", id: "conta-email", autocomplete: "email",
                                required: true, value: emailPendente });
    const enviar = el("button", { type: "submit", class: "botao botao-primario", texto: "Enviar código" });
    const form = el("form", {},
      el("p", { texto: "Entre para guardar seus interesses e usá-los em qualquer aparelho. " +
                       "É opcional: o Radar funciona sem cadastro." }),
      el("label", { class: "campo" }, "E-mail", email),
      enviar,
      el("p", { class: "suave" }, "Enviaremos um código de acesso, sem senha. Veja como tratamos seus dados na ",
         el("a", { href: "privacidade.html", target: "_blank", texto: "política de privacidade" }), "."));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      ocupado(enviar, async () => {
        emailPendente = email.value.trim().toLowerCase();
        await enviarCodigo(emailPendente);
        telaCodigo();
      });
    });
    corpo.replaceChildren(form);
    email.focus();
  }

  function telaCodigo() {
    titulo("Digite o código");
    const codigo = el("input", { id: "conta-codigo", inputmode: "numeric", autocomplete: "one-time-code",
                                 required: true, pattern: "[0-9]{6,10}", maxlength: "10" });
    const entrar = el("button", { type: "submit", class: "botao botao-primario", texto: "Entrar" });
    const outro = el("button", { type: "button", class: "botao botao-secundario", texto: "Usar outro e-mail" });
    const form = el("form", {},
      el("p", {}, "Enviamos um código para ", el("strong", { texto: emailPendente }),
         ". Ele vale por poucos minutos. Confira também a caixa de spam."),
      el("label", { class: "campo" }, "Código", codigo), entrar, outro);
    outro.addEventListener("click", () => { aviso(""); telaEmail(); });
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      ocupado(entrar, async () => {
        await confirmarCodigo(emailPendente, codigo.value.trim());
        await carregarPerfil();
        atualizarBotao();
        if (!perfil || perfil.termos_versao !== CFG.versao) telaCadastro();
        else { radar.aplicarInteresses(perfil.areas_interesse, perfil.tipos_interesse); telaConta(); }
      });
    });
    corpo.replaceChildren(form);
    codigo.focus();
  }

  function campoTexto(rotulo, nome, valor, dica, extra = {}) {
    return el("label", { class: "campo" }, rotulo, dica ? el("span", { class: "dica", texto: dica }) : null,
              el("input", { name: nome, value: valor || "", maxlength: "120", ...extra }));
  }

  function telaCadastro() {
    const novo = !perfil, versaoNova = perfil && perfil.termos_versao !== CFG.versao;
    titulo(novo ? "Complete seu cadastro" : versaoNova ? "Atualizamos os termos" : "Editar meus dados");
    const p = perfil || {};
    const vinculo = el("select", { name: "vinculo", required: true },
      el("option", { value: "", texto: "Escolha…" }),
      ...Object.entries(VINCULOS).map(([v, r]) => el("option", { value: v, texto: r, selected: p.vinculo === v })));
    const uf = el("select", { name: "uf" }, el("option", { value: "", texto: "—" }),
      ...UFS.map(u => el("option", { value: u, texto: u, selected: p.uf === u })));
    const termos = el("input", { type: "checkbox", name: "termos", required: true,
                                 checked: !novo && !versaoNova });
    const idade = el("input", { type: "checkbox", name: "idade", required: true, checked: !novo });
    const pesquisa = el("input", { type: "checkbox", name: "pesquisa", checked: !!p.pesquisa_consentida });
    const salvar = el("button", { type: "submit", class: "botao botao-primario",
                                  texto: novo ? "Concluir cadastro" : "Salvar" });
    const form = el("form", { novalidate: false },
      versaoNova ? el("p", { texto: "A política de privacidade mudou. Leia e aceite a nova versão para continuar com sua conta." }) : null,
      el("p", { class: "suave", texto: "Obrigatórios: vínculo, aceite dos termos e declaração de idade. Seus interesses são as áreas e os tipos marcados nos filtros." }),
      campoTexto("Nome", "nome", p.nome, "Opcional", { autocomplete: "name" }),
      el("label", { class: "campo" }, "Vínculo", vinculo),
      campoTexto("Curso ou área de atuação", "curso_area", p.curso_area, "Opcional"),
      campoTexto("Instituição", "instituicao", p.instituicao, "Opcional", { autocomplete: "organization" }),
      el("div", { class: "linha" },
         campoTexto("Município", "municipio", p.municipio, "Opcional", { maxlength: "80", autocomplete: "address-level2" }),
         el("label", { class: "campo" }, "UF", el("span", { class: "dica", texto: "Opcional" }), uf)),
      el("label", { class: "marcar" }, termos,
         el("span", {}, "Li e aceito os ",
            el("a", { href: "privacidade.html", target: "_blank", texto: "termos de uso e a política de privacidade" }),
            " (versão " + CFG.versao + ").")),
      el("label", { class: "marcar" }, idade, el("span", { texto: "Declaro ter 18 anos ou mais." })),
      el("label", { class: "marcar" }, pesquisa,
         el("span", { texto: "Autorizo, de forma opcional, o uso dos meus dados sem nome nem e-mail em estudos " +
                             "sobre o acesso a editais, bolsas, eventos e vagas. Posso retirar quando quiser." })),
      salvar);
    if (novo) {
      const cancelar = el("button", { type: "button", class: "botao botao-secundario",
                                      texto: "Não quero me cadastrar (apagar meu e-mail)" });
      cancelar.addEventListener("click", () => ocupado(cancelar, async () => {
        await excluirConta();
        atualizarBotao();
        telaEmail();
        aviso("Pronto: seu e-mail foi apagado. Você pode continuar usando o Radar sem cadastro.", true);
      }));
      form.append(cancelar);
    } else {
      const voltar = el("button", { type: "button", class: "botao botao-secundario", texto: "Voltar" });
      voltar.addEventListener("click", () => { aviso(""); telaConta(); });
      if (!versaoNova) form.append(voltar);
    }
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const d = new FormData(form), texto = n => (d.get(n) || "").toString().trim() || null;
      const { areas, tipos } = radar.interesses();
      ocupado(salvar, async () => {
        await salvarPerfil({
          nome: texto("nome"), vinculo: d.get("vinculo"), curso_area: texto("curso_area"),
          instituicao: texto("instituicao"), municipio: texto("municipio"), uf: texto("uf"),
          maior_de_idade: true, termos_versao: CFG.versao,
          pesquisa_consentida: pesquisa.checked, pesquisa_versao: CFG.versao,
          ...(novo ? { areas_interesse: areas, tipos_interesse: tipos } : {}),
        });
        atualizarBotao();
        telaConta();
        aviso(novo ? "Cadastro concluído. Seus filtros agora ficam salvos na sua conta." : "Dados salvos.", true);
      });
    });
    corpo.replaceChildren(form);
    form.querySelector("input, select").focus();
  }

  function telaConta() {
    titulo("Minha conta");
    const p = perfil;
    const linha = (rotulo, valor) => [el("dt", { texto: rotulo }), el("dd", { texto: valor || "—" })];
    const resumo = el("dl", {},
      ...linha("E-mail", sessaoMemoria.user.email), ...linha("Nome", p.nome),
      ...linha("Vínculo", VINCULOS[p.vinculo] || p.vinculo), ...linha("Curso ou área", p.curso_area),
      ...linha("Instituição", p.instituicao),
      ...linha("Município/UF", [p.municipio, p.uf].filter(Boolean).join(" / ")),
      ...linha("Uso em estudos", p.pesquisa_consentida ? "Autorizado" : "Não autorizado"),
      ...linha("Termos aceitos", "versão " + p.termos_versao));
    const editar = el("button", { type: "button", class: "botao botao-secundario", texto: "Editar dados e autorizações" });
    const baixar = el("button", { type: "button", class: "botao botao-secundario", texto: "Baixar meus dados" });
    const botaoSair = el("button", { type: "button", class: "botao botao-secundario", texto: "Sair" });
    const excluir = el("button", { type: "button", class: "botao botao-perigo", texto: "Excluir minha conta" });
    editar.addEventListener("click", () => { aviso(""); telaCadastro(); });
    baixar.addEventListener("click", () => ocupado(baixar, baixarDados));
    botaoSair.addEventListener("click", async () => {
      await sair(); atualizarBotao(); aviso(""); fechar();
    });
    excluir.addEventListener("click", () => {
      if (!window.confirm("Excluir sua conta apaga seu cadastro, seus interesses e o histórico de " +
                          "autorizações. Não dá para desfazer. Continuar?")) return;
      ocupado(excluir, async () => {
        await excluirConta();
        atualizarBotao();
        telaEmail();
        aviso("Sua conta e seus dados foram excluídos.", true);
      });
    });
    corpo.replaceChildren(el("div", { class: "pilha" },
      resumo, el("p", { class: "suave", texto: "Seus filtros de áreas e tipos ficam salvos na conta." }),
      editar, baixar, botaoSair, excluir,
      el("p", { class: "suave" }, "Dúvidas sobre seus dados: veja a ",
         el("a", { href: "privacidade.html", target: "_blank", texto: "política de privacidade" }), ".")));
    editar.focus();
  }

  function abrir() {
    aviso("");
    if (!janela.open) janela.showModal();  // antes de desenhar: cada tela põe o foco no 1º campo
    if (!sessaoMemoria) telaEmail();
    else if (!perfil || perfil.termos_versao !== CFG.versao) telaCadastro();
    else telaConta();
  }
  function fechar() { if (janela.open) janela.close(); $("entrar").focus(); }

  $("entrar").addEventListener("click", abrir);
  $("conta-fechar").addEventListener("click", fechar);
  janela.addEventListener("click", ev => { if (ev.target === janela) fechar(); });

  // Ao abrir o app com sessão guardada: carrega o perfil e aplica os interesses.
  atualizarBotao();
  if (sessaoMemoria) {
    carregarPerfil().then(p => {
      if (p) radar.aplicarInteresses(p.areas_interesse, p.tipos_interesse);
      atualizarBotao();
    }).catch(e => { if (e.status === 401) { gravarSessao(null); atualizarBotao(); } });
  }
})();
