// Radar de Oportunidades: entrada (código por e-mail), cadastro e configurações
// da conta. Só é carregado quando config/app.yaml tem controlador e Supabase.
// Fala direto com as APIs REST do Supabase (Auth e PostgREST), sem biblioteca.
// A proteção dos dados está nas regras do banco: supabase/schema.sql.
// Páginas (rotas tratadas no modelo do site): #entrar, #conta, #conta/<seção>.
"use strict";
(() => {
  const radar = window.radar;
  const CFG = radar && radar.config;
  if (!CFG || !CFG.cadastro || !CFG.supabase) return;
  const BASE = CFG.supabase.url, CHAVE_API = CFG.supabase.chave_publica;
  const CHAVE_SESSAO = "radar-sessao";
  const el = radar.el;

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

  const P = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const I = Object.assign({
    pessoa: `<svg ${P}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`,
    pessoaMais: `<svg ${P}><circle cx="10" cy="8" r="4"/><path d="M2 21c0-4 4-6 8-6 2 0 3.5.4 4.8 1.1M19 14v6M16 17h6"/></svg>`,
    escudo: `<svg ${P}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
    engrenagem: `<svg ${P}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>`,
    alvo: `<svg ${P}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
    cadeado: `<svg ${P}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    email: `<svg ${P}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
    baixar: `<svg ${P}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`,
    lixeira: `<svg ${P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
    documento: `<svg ${P}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
    sair: `<svg ${P}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
    seta: `<svg ${P}><path d="M9 6l6 6-6 6"/></svg>`,
  }, radar.icones);

  let perfil = null, perfilCarregado = false, emailPendente = "", etapa = "email";
  let destino = null, mensagem = null;

  // ------------------------------------------------------------ armazenamento
  function lerLocal(chave) { try { return JSON.parse(localStorage.getItem(chave) || "null"); } catch (e) { return null; } }
  let sessaoMemoria = lerLocal(CHAVE_SESSAO);
  function gravarSessao(s) {
    sessaoMemoria = s;
    try {
      if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
      else localStorage.removeItem(CHAVE_SESSAO);
    } catch (e) { /* sem armazenamento: a sessão dura só até fechar a página */ }
  }

  // ----------------------------------------------------------------- rede
  class ErroConta extends Error {
    constructor(texto, status) { super(texto); this.status = status; }
  }

  function mensagemErro(status, dados, caminho) {
    if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (caminho.startsWith("/auth/v1/verify")) return "Código inválido ou expirado. Confira ou peça um novo.";
    if (status === 401 || status === 403) return "Sua sessão terminou. Entre de novo.";
    const texto = dados && (dados.msg || dados.message || dados.error_description);
    return "Não foi possível concluir agora" + (texto ? " (" + texto + ")" : "") + ".";
  }

  async function pedir(caminho, { metodo = "GET", corpo, sessao = null, prefer } = {}) {
    const cabecalhos = { apikey: CHAVE_API, "Content-Type": "application/json" };
    if (sessao) cabecalhos.Authorization = "Bearer " + sessao.access_token;
    if (prefer) cabecalhos.Prefer = prefer;
    let resposta;
    try {
      resposta = await fetch(BASE + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
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
    perfilCarregado = true;
    if (perfil) {
      radar.aplicarInteresses(perfil.areas_interesse || [], perfil.tipos_interesse || []);
      // Favoritos do aparelho e da conta se somam.
      const remotos = perfil.favoritos || [], juntos = [...new Set([...remotos, ...radar.favoritos()])];
      radar.definirFavoritos(juntos);
      if (juntos.length !== remotos.length) salvarPerfil({ favoritos: juntos }).catch(() => {});
    }
    return perfil;
  }

  let carregando = null;  // evita duas leituras simultâneas do perfil
  function garantirPerfil() {
    if (!carregando) carregando = carregarPerfil().finally(() => { carregando = null; });
    return carregando;
  }

  async function salvarPerfil(campos) {
    const id = sessaoMemoria.user.id;
    const linhas = perfil
      ? await rest("perfis?id=eq." + id, { metodo: "PATCH", corpo: campos, prefer: "return=representation" })
      : await rest("perfis", { metodo: "POST", corpo: { id, ...campos }, prefer: "return=representation" });
    perfil = linhas[0];
  }

  function esquecer() { gravarSessao(null); perfil = null; perfilCarregado = false; etapa = "email"; }

  async function sair() {
    const s = sessaoMemoria;
    esquecer();
    if (s) pedir("/auth/v1/logout", { metodo: "POST", sessao: s }).catch(() => {});
  }

  async function excluirConta() {
    await rest("rpc/excluir_minha_conta", { metodo: "POST", corpo: {} });
    esquecer();
  }

  async function baixarDados() {
    const consentimentos = await rest("consentimentos?select=finalidade,concedido,versao,registrado_em&order=registrado_em");
    const copia = {
      gerado_em: new Date().toISOString(),
      email: sessaoMemoria.user.email,
      perfil: await carregarPerfil(),
      historico_de_consentimentos: consentimentos,
      neste_aparelho: { filtros: lerLocal("radar-filtros"), favoritos: lerLocal("radar-favoritos") },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" }));
    const a = el("a", { href: url, download: "meus-dados-radar-de-oportunidades.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Filtros e favoritos: com cadastro feito, cada mudança vai para a conta
  // (com atraso, para juntar vários cliques num só envio).
  const atrasos = {};
  function sincronizar(nome, campos) {
    if (!perfil || !sessaoMemoria) return;
    clearTimeout(atrasos[nome]);
    atrasos[nome] = setTimeout(() => salvarPerfil(campos()).catch(() => {}), 1500);
  }
  radar.aoMudarFiltros(() => sincronizar("filtros", () => {
    const { areas, tipos } = radar.interesses();
    return { areas_interesse: areas, tipos_interesse: tipos };
  }));
  radar.aoMudarFavoritos(() => sincronizar("favoritos", () => ({ favoritos: radar.favoritos() })));

  // ------------------------------------------------------------- interface
  function botaoCabecalho() {
    const ok = sessaoMemoria && perfil && perfil.termos_versao === CFG.versao;
    document.getElementById("entrar").hidden = false;
    document.getElementById("entrar-rotulo").textContent = ok ? "Minha conta" : "Entrar";
  }

  function mostrarMensagem() {
    if (!mensagem) return null;
    const m = el("p", { class: "msg" + (mensagem.ok ? " ok" : ""), role: mensagem.ok ? "status" : "alert",
                        texto: mensagem.texto });
    mensagem = null;
    return m;
  }

  function desenhar(...partes) {
    destino.replaceChildren(...partes.filter(Boolean));
    const t = document.getElementById("vista-titulo");
    if (t) t.focus({ preventScroll: true });
  }

  function cabeca(icone, titulo, sub) {
    return el("div", { class: "cabeca-pagina" }, el("div", { class: "ico-grande", html: icone }),
      el("div", {}, el("h1", { id: "vista-titulo", tabindex: "-1", texto: titulo }), sub ? el("p", { texto: sub }) : null));
  }

  async function ocupado(botao, tarefa) {
    botao.disabled = true;
    const antigo = destino.querySelector(".msg");
    if (antigo) antigo.remove();
    try { await tarefa(); }
    catch (e) {
      const m = el("p", { class: "msg", role: "alert", texto: e.message || "Algo deu errado. Tente de novo." });
      botao.closest("form, .painel").prepend(m);
      if (e.status === 401) { esquecer(); botaoCabecalho(); }
    } finally { botao.disabled = false; }
  }

  function ir(hash, msg) {
    mensagem = msg || null;
    if (location.hash === hash) radar.rota(); else location.hash = hash;
  }

  const beneficios = () => el("section", { class: "painel", "aria-label": "Por que ter uma conta" },
    el("div", { class: "beneficios" },
      ...[[I.salvar, "Salve oportunidades", "Guarde editais e encontre-os em qualquer aparelho."],
          [I.camadas, "Personalize o Radar", "Suas áreas e tipos de interesse acompanham você."],
          [I.calendario, "Acompanhe seus prazos", "Adicione prazos à sua agenda com um toque."]]
        .map(([icone, t, d]) => el("div", { class: "beneficio" }, el("div", { class: "ico", html: icone }),
                                     el("div", {}, el("strong", { texto: t }), el("span", { texto: d })))),
      el("p", { class: "caixa-info", html: I.info },
         el("span", { texto: "A conta é opcional: o Radar funciona sem ela." }))));

  const rodapeLgpd = () => el("p", { class: "rodape-form", html: I.cadeado },
    el("span", {}, "Seus dados são tratados conforme a LGPD. Veja a ",
       el("a", { href: "privacidade.html", texto: "política de privacidade" }), "."));

  // ---- Entrar (e-mail → código)
  function paginaEntrar() {
    let form;
    if (etapa === "codigo") {
      const codigo = el("input", { id: "conta-codigo", inputmode: "numeric", autocomplete: "one-time-code",
                                   required: true, pattern: "[0-9]{6,10}", maxlength: "10", placeholder: "000000" });
      const entrar = el("button", { type: "submit", class: "botao botao-primario", texto: "Entrar" });
      const outro = el("button", { type: "button", class: "botao botao-secundario", texto: "Usar outro e-mail" });
      form = el("form", { class: "form" },
        el("p", {}, "Enviamos um código para ", el("strong", { texto: emailPendente }),
           ". Ele vale por poucos minutos. Confira também a caixa de spam."),
        el("label", { class: "campo" }, "Código de acesso", codigo), entrar, outro);
      outro.addEventListener("click", () => { etapa = "email"; radar.rota(); });
      form.addEventListener("submit", ev => {
        ev.preventDefault();
        ocupado(entrar, async () => {
          await confirmarCodigo(emailPendente, codigo.value.trim());
          etapa = "email";
          await carregarPerfil();
          botaoCabecalho();
          ir("#conta", perfil ? { ok: true, texto: "Você entrou na sua conta." } : null);
        });
      });
    } else {
      const email = el("input", { type: "email", id: "conta-email", autocomplete: "email", required: true,
                                  value: emailPendente, placeholder: "seu@email.com" });
      const enviar = el("button", { type: "submit", class: "botao botao-primario", html: I.email + "Enviar código" });
      form = el("form", { class: "form" },
        el("label", { class: "campo" }, "E-mail institucional ou pessoal", email), enviar);
      form.addEventListener("submit", ev => {
        ev.preventDefault();
        ocupado(enviar, async () => {
          emailPendente = email.value.trim().toLowerCase();
          await enviarCodigo(emailPendente);
          etapa = "codigo";
          radar.rota();
        });
      });
    }
    const painel = el("section", { class: "painel" },
      mostrarMensagem(),
      cabeca(I.pessoa, etapa === "codigo" ? "Digite o código" : "Entrar ou criar conta",
             "Sem senha: enviamos um código para o seu e-mail. No primeiro acesso, você completa um cadastro curto."),
      form, rodapeLgpd());
    desenhar(el("div", { class: "conta-grade" }, el("div", { class: "lateral" }, beneficios()), painel));
    const campo = destino.querySelector("input");
    if (campo) campo.focus();
  }

  // ---- Peças dos formulários
  function campoTexto(rotulo, nome, valor, extra = {}) {
    return el("label", { class: "campo" }, el("span", {}, rotulo, " ", el("span", { class: "opcional", texto: "Opcional" })),
              el("input", { name: nome, value: valor || "", maxlength: "120", ...extra }));
  }

  function camposPerfil(p) {
    const vinculo = el("select", { name: "vinculo", required: true },
      el("option", { value: "", texto: "Selecione seu vínculo" }),
      ...Object.entries(VINCULOS).map(([v, r]) => el("option", { value: v, texto: r, selected: p.vinculo === v })));
    const uf = el("select", { name: "uf" }, el("option", { value: "", texto: "—" }),
      ...UFS.map(u => el("option", { value: u, texto: u, selected: p.uf === u })));
    return el("div", { class: "grade-campos" },
      campoTexto("Nome de exibição", "nome", p.nome, { autocomplete: "name", placeholder: "Como você quer ser chamado(a)" }),
      el("label", { class: "campo" }, "Vínculo", vinculo),
      campoTexto("Instituição", "instituicao", p.instituicao, { autocomplete: "organization" }),
      campoTexto("Curso ou área", "curso_area", p.curso_area),
      campoTexto("Município", "municipio", p.municipio, { maxlength: "80", autocomplete: "address-level2" }),
      el("label", { class: "campo" }, el("span", {}, "UF ", el("span", { class: "opcional", texto: "Opcional" })), uf));
  }

  function lerCamposPerfil(form) {
    const d = new FormData(form), texto = n => (d.get(n) || "").toString().trim() || null;
    return { nome: texto("nome"), vinculo: d.get("vinculo"), curso_area: texto("curso_area"),
             instituicao: texto("instituicao"), municipio: texto("municipio"), uf: texto("uf") };
  }

  function escolhaInteresses(areasMarcadas, tiposMarcados) {
    const { areas, tipos } = radar.opcoes();
    const grupo = (legenda, nome, opcoes, marcadas) => el("fieldset", { class: "chips-escolha" },
      el("legend", { texto: legenda }),
      ...Object.entries(opcoes).map(([v, r]) => el("label", { class: "chip-check" },
        el("input", { type: "checkbox", name: nome, value: v, checked: marcadas.includes(v) }), r)));
    const contagem = el("p", { class: "preferencias", "aria-live": "polite" });
    const bloco = el("div", { class: "form" },
      grupo("Áreas de interesse", "area", areas, areasMarcadas),
      grupo("Tipos de oportunidades", "tipo", tipos, tiposMarcados), contagem);
    const contar = () => {
      const n = s => bloco.querySelectorAll(`input[name=${s}]:checked`).length;
      contagem.replaceChildren(el("span", { html: I.alvo }), el("span", { texto: "Suas preferências:" }),
        el("span", {}, el("strong", { texto: n("area") }), n("area") === 1 ? " área" : " áreas"),
        el("span", {}, el("strong", { texto: n("tipo") }), n("tipo") === 1 ? " tipo" : " tipos"));
    };
    bloco.addEventListener("change", contar);
    contar();
    return bloco;
  }

  function lerInteresses(form) {
    const marcadas = n => [...form.querySelectorAll(`input[name=${n}]:checked`)].map(c => c.value);
    return { areas_interesse: marcadas("area"), tipos_interesse: marcadas("tipo") };
  }

  // ---- Criar conta (ou aceitar nova versão dos termos)
  function paginaCadastro() {
    const novo = !perfil;
    const p = perfil || {};
    const atuais = radar.interesses();
    const termos = el("input", { type: "checkbox", name: "termos", required: true });
    const idade = el("input", { type: "checkbox", name: "idade", required: true, checked: !novo });
    const pesquisa = el("input", { type: "checkbox", name: "pesquisa", checked: !!p.pesquisa_consentida });
    const salvar = el("button", { type: "submit", class: "botao botao-primario",
                                  texto: novo ? "Criar conta" : "Aceitar e continuar" });
    const form = el("form", { class: "form" },
      el("label", { class: "campo" }, "E-mail", el("input", { value: sessaoMemoria.user.email, readonly: true })),
      camposPerfil(p),
      escolhaInteresses(novo ? atuais.areas : p.areas_interesse || [], novo ? atuais.tipos : p.tipos_interesse || []),
      el("div", { class: "caixa-info", html: I.escudo },
        el("div", { class: "form" },
          el("label", { class: "marcar" }, termos,
             el("span", {}, "Li e aceito os ",
                el("a", { href: "privacidade.html", target: "_blank", texto: "termos de uso e a política de privacidade" }),
                " (versão " + CFG.versao + ").")),
          el("label", { class: "marcar" }, idade, el("span", { texto: "Declaro ter 18 anos ou mais." })),
          el("label", { class: "marcar" }, pesquisa,
             el("span", { texto: "Opcional: autorizo o uso dos meus dados, sem nome nem e-mail, em estudos " +
                                 "sobre o acesso a editais, bolsas, eventos e vagas. Posso retirar quando quiser." })))),
      salvar);
    if (novo) {
      const desistir = el("button", { type: "button", class: "botao botao-secundario",
                                      texto: "Não quero me cadastrar (apagar meu e-mail)" });
      desistir.addEventListener("click", () => ocupado(desistir, async () => {
        await excluirConta();
        botaoCabecalho();
        ir("#entrar", { ok: true, texto: "Pronto: seu e-mail foi apagado. Você pode continuar usando o Radar sem conta." });
      }));
      form.append(desistir);
    }
    form.append(rodapeLgpd());
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const interesses = lerInteresses(form);
      ocupado(salvar, async () => {
        await salvarPerfil({
          ...lerCamposPerfil(form), ...interesses,
          maior_de_idade: true, termos_versao: CFG.versao,
          pesquisa_consentida: pesquisa.checked, pesquisa_versao: CFG.versao,
          ...(novo ? { favoritos: radar.favoritos() } : {}),
        });
        radar.aplicarInteresses(interesses.areas_interesse, interesses.tipos_interesse);
        botaoCabecalho();
        ir("#conta", { ok: true, texto: novo ? "Conta criada. Seus interesses e oportunidades salvas agora ficam na sua conta."
                                             : "Termos aceitos. Obrigado!" });
      });
    });
    desenhar(
      cabeca(I.pessoaMais, novo ? "Criar conta" : "Atualizamos os termos",
             novo ? "O cadastro é opcional e serve para guardar seus interesses e oportunidades salvas."
                  : "A política de privacidade mudou. Leia e aceite a nova versão para continuar com sua conta."),
      el("div", { class: "conta-grade" },
        el("div", { class: "lateral" }, beneficios(),
           el("p", { class: "alerta-laranja", html: I.info },
              el("span", { texto: "Obrigatórios: vínculo, aceite dos termos e declaração de idade." }))),
        el("section", { class: "painel" }, mostrarMensagem(), form)));
  }

  // ---- Configurações da conta e privacidade
  const SECOES = [
    ["perfil", I.pessoa, "Perfil", "Seus dados básicos"],
    ["interesses", I.alvo, "Interesses", "Áreas, tipos e oportunidades salvas"],
    ["privacidade", I.escudo, "Privacidade e dados", "Consentimentos e seus direitos (LGPD)"],
  ];

  function secaoPerfil() {
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: I.check + "Salvar alterações" });
    const desfazer = el("button", { type: "reset", class: "botao botao-secundario", texto: "Cancelar" });
    const form = el("form", { class: "form" },
      el("h2", { texto: "Dados básicos" }),
      el("p", { class: "areas", texto: "Informações para identificar você e personalizar o Radar." }),
      el("label", { class: "campo" }, "E-mail", el("input", { value: sessaoMemoria.user.email, readonly: true })),
      camposPerfil(perfil),
      el("p", { class: "caixa-info", html: I.info },
         el("span", { texto: "Só o vínculo é obrigatório. Os demais campos são opcionais e ajudam nos estudos sobre o acesso a oportunidades, se você autorizar." })),
      el("div", { class: "acoes" }, salvar, desfazer));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      ocupado(salvar, async () => {
        await salvarPerfil(lerCamposPerfil(form));
        ir("#conta/perfil", { ok: true, texto: "Dados salvos." });
      });
    });
    return form;
  }

  function secaoInteresses() {
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: I.check + "Salvar interesses" });
    const n = radar.favoritos().length;
    const form = el("form", { class: "form" },
      el("h2", { texto: "Interesses" }),
      el("p", { class: "areas", texto: "As áreas e os tipos escolhidos aqui também são os filtros da lista de oportunidades." }),
      escolhaInteresses(perfil.areas_interesse || [], perfil.tipos_interesse || []),
      el("p", { class: "caixa-info", html: I.salvar },
         el("span", {}, n === 1 ? "Você tem 1 oportunidade salva. " : `Você tem ${n} oportunidades salvas. `,
            "Para vê-las, use o filtro “Só as que salvei” na ", el("a", { href: "#inicio", texto: "lista" }), ".")),
      el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const interesses = lerInteresses(form);
      ocupado(salvar, async () => {
        await salvarPerfil(interesses);
        radar.aplicarInteresses(interesses.areas_interesse, interesses.tipos_interesse);
        ir("#conta/interesses", { ok: true, texto: "Interesses salvos." });
      });
    });
    return form;
  }

  function secaoPrivacidade() {
    const pesquisa = el("input", { type: "checkbox", name: "pesquisa", checked: !!perfil.pesquisa_consentida });
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: I.check + "Salvar autorização" });
    const form = el("form", { class: "form" },
      el("h2", { texto: "Privacidade e dados" }),
      el("p", { class: "caixa-info", html: I.escudo },
         el("span", {}, "Seguimos a LGPD com ", el("strong", { texto: "minimização de dados" }),
            ": coletamos só o necessário para o Radar funcionar e para os estudos que você autorizar.")),
      el("label", { class: "marcar" }, pesquisa,
         el("span", { texto: "Autorizo o uso dos meus dados, sem nome nem e-mail, em estudos sobre o acesso a " +
                             "editais, bolsas, eventos e vagas. Posso retirar quando quiser." })),
      el("p", { class: "areas", texto: "Termos aceitos: versão " + perfil.termos_versao +
        (perfil.termos_aceitos_em ? ", em " + new Date(perfil.termos_aceitos_em).toLocaleDateString("pt-BR") : "") + "." }),
      el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      ocupado(salvar, async () => {
        await salvarPerfil({ pesquisa_consentida: pesquisa.checked, pesquisa_versao: CFG.versao });
        ir("#conta/privacidade", { ok: true, texto: pesquisa.checked ? "Autorização registrada." : "Autorização retirada." });
      });
    });
    const acao = (icone, titulo, desc, fn, perigo) => {
      const b = el("button", { type: "button", class: perigo ? "perigo" : null, html: icone },
                   el("div", {}, el("strong", { texto: titulo }), el("span", { texto: desc })), el("span", { html: I.seta }));
      b.addEventListener("click", () => fn(b));
      return b;
    };
    const acoes = el("div", { class: "lista-acoes" },
      acao(I.baixar, "Baixar meus dados", "Cópia de tudo o que está na sua conta, em arquivo JSON.",
           b => ocupado(b, baixarDados)),
      acao(I.documento, "Política de privacidade", "Como tratamos seus dados e como exercer seus direitos.",
           () => { location.href = "privacidade.html"; }),
      acao(I.sair, "Sair da conta", "Seus filtros e salvos continuam neste aparelho.",
           async () => { await sair(); botaoCabecalho(); ir("#inicio"); }),
      acao(I.lixeira, "Excluir minha conta", "Apaga de forma definitiva sua conta e seus dados.", b => {
        if (!window.confirm("Excluir sua conta apaga seu cadastro, seus interesses, suas oportunidades salvas " +
                            "na conta e o histórico de autorizações. Não dá para desfazer. Continuar?")) return;
        ocupado(b, async () => {
          await excluirConta();
          botaoCabecalho();
          ir("#entrar", { ok: true, texto: "Sua conta e seus dados foram excluídos." });
        });
      }, true));
    return el("div", { class: "form" }, form, acoes);
  }

  function paginaConta(secao) {
    if (!SECOES.some(s => s[0] === secao)) secao = "perfil";
    const nav = el("nav", { class: "painel lateral nav-conta", "aria-label": "Seções da conta" },
      ...SECOES.map(([id, icone, titulo, desc]) => {
        const b = el("button", { type: "button", html: icone, "aria-current": String(id === secao) },
                     el("div", {}, titulo, el("span", { texto: desc })));
        b.addEventListener("click", () => ir("#conta/" + id));
        return b;
      }));
    const conteudo = { perfil: secaoPerfil, interesses: secaoInteresses, privacidade: secaoPrivacidade }[secao]();
    desenhar(
      cabeca(I.engrenagem, "Configurações da conta e privacidade",
             "Gerencie seu perfil, seus interesses e o uso dos seus dados, conforme a LGPD."),
      el("div", { class: "conta-grade" }, nav, el("section", { class: "painel" }, mostrarMensagem(), conteudo)));
  }

  // ---- Rotas
  function mostrar(hash, vista) {
    destino = vista;
    if (!sessaoMemoria) {
      document.title = "Entrar · Radar de Oportunidades";
      return paginaEntrar();
    }
    if (!perfilCarregado) {
      desenhar(cabeca(I.pessoa, "Carregando sua conta…", null));
      garantirPerfil().then(() => { botaoCabecalho(); radar.rota(); })
        .catch(e => {
          if (e.status === 401) esquecer();
          else perfilCarregado = false;
          mensagem = { texto: e.message };
          botaoCabecalho();
          if (!sessaoMemoria) radar.rota();
          else desenhar(cabeca(I.pessoa, "Não foi possível abrir sua conta", e.message));
        });
      return;
    }
    if (!perfil || perfil.termos_versao !== CFG.versao) {
      document.title = "Criar conta · Radar de Oportunidades";
      return paginaCadastro();
    }
    if (hash === "entrar") { location.replace("#conta"); return; }
    document.title = "Minha conta · Radar de Oportunidades";
    paginaConta(hash.split("/")[1] || "perfil");
  }

  radar.conta = { mostrar };
  document.getElementById("entrar").addEventListener("click", () => {
    location.hash = sessaoMemoria ? "#conta" : "#entrar";
  });
  botaoCabecalho();
  if (sessaoMemoria) {
    garantirPerfil().then(botaoCabecalho)
      .catch(e => { if (e.status === 401) { esquecer(); botaoCabecalho(); } });
  }
  radar.rota();  // a página pode ter sido aberta direto em #entrar ou #conta
})();
