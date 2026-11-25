// conta.html?aba=perfil|interesses|notificacoes|privacidade|seguranca
"use strict";
(async () => {
  const RC = window.RC, $ = id => document.getElementById(id), el = RC.el;
  if (!(await RC.carregarSupabase())) return RC.indisponivel($("area"));
  const params = new URLSearchParams(location.search);
  let recuperando = params.get("recuperar") === "1";
  RC.cliente().auth.onAuthStateChange(evento => { if (evento === "PASSWORD_RECOVERY") recuperando = true; });
  const s = await RC.exigirSessao();
  if (!s) return;
  await RC.montarTopo();
  const painel = $("painel"), db = RC.cliente();
  let p;
  try { p = await RC.perfil(s); } catch (e) { return RC.mensagem(painel, RC.traduzErro(e)); }
  if (!p) return RC.mensagem(painel, "Seu perfil não foi encontrado. Saia e entre de novo; se continuar, escreva para " + RC.controlador.email + ".");
  const precisaAceitar = p.termos_versao !== RC.config.versaoTermos;

  const ABAS = [
    ["perfil", RC.I.pessoa, "Perfil", "Seus dados básicos"],
    ["interesses", RC.I.alvo, "Interesses", "Áreas e tipos de oportunidade"],
    ["notificacoes", RC.I.sino, "Notificações", "Alertas e newsletter"],
    ["privacidade", RC.I.escudo, "Privacidade e dados", "Consentimentos e LGPD"],
    ["seguranca", RC.I.cadeado, "Segurança", "Senha e acesso"],
  ];
  let aba = params.get("aba");
  if (recuperando) aba = "seguranca";
  if (precisaAceitar) aba = "privacidade";
  if (!ABAS.some(a => a[0] === aba)) aba = "perfil";
  $("abas-conta").replaceChildren(...ABAS.map(([id, icone, t, d]) =>
    el("a", { href: "conta.html?aba=" + id, html: icone, "aria-current": id === aba ? "page" : null },
       el("div", {}, t, el("span", { texto: d })))));
  const atual = ABAS.find(a => a[0] === aba);
  document.title = atual[2] + " · Minha conta · Radar de Oportunidades";

  const titulo = (icone, t, d) => el("div", { class: "secao-titulo" }, el("span", { class: "ico", html: icone }),
    el("div", {}, el("h2", { texto: t }), d ? el("p", { texto: d }) : null));
  const dataHora = iso => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
  async function atualizar(campos, okTexto, depois) {
    const { data, error } = await db.from("perfis").update(campos).eq("id", s.user.id).select().single();
    if (error) return RC.mensagem(painel, RC.traduzErro(error));
    p = data;
    if (depois) await depois();  // pode redesenhar a aba: a mensagem vem depois
    RC.mensagem(painel, okTexto, true);
  }
  function interruptor(nome, marcado, icone, t, d) {
    return el("label", { class: "linha-interruptor" }, el("span", { html: icone }),
      el("span", {}, el("strong", { texto: t }), el("span", { class: "desc", texto: d })),
      el("input", { type: "checkbox", class: "interruptor", role: "switch", name: nome, checked: marcado }));
  }
  const AVISO_ENVIO = () => el("p", { class: "caixa-info", html: RC.I.info },
    el("span", { texto: "O envio de alertas e da newsletter começa em breve. Por enquanto, guardamos sua preferência." }));

  // ---------------------------------------------------------------- abas
  function abaPerfil() {
    const vinc = el("select", { name: "vinculo" }, el("option", { value: "", texto: "Selecione seu vínculo" }),
      ...Object.entries(RC.VINCULOS).map(([v, r]) => el("option", { value: v, texto: r, selected: p.vinculo === v })));
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar alterações" });
    const form = el("form", { class: "form" },
      titulo(RC.I.pessoa, "Dados básicos", "Informações para personalizar o Radar."),
      el("label", { class: "campo" }, "E-mail", el("input", { value: s.user.email, readonly: true })),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, el("span", {}, "Nome de exibição ", el("span", { class: "opcional", texto: "Opcional" })),
           el("input", { name: "nome_exibicao", value: p.nome_exibicao || "", maxlength: "80", autocomplete: "nickname" })),
        el("label", { class: "campo" }, el("span", {}, "Vínculo ", el("span", { class: "opcional", texto: "Opcional" })), vinc),
        el("label", { class: "campo" }, el("span", {}, "Curso ou área ", el("span", { class: "opcional", texto: "Opcional" })),
           el("input", { name: "curso_area", value: p.curso_area || "", maxlength: "120" }))),
      el("p", { class: "caixa-info", html: RC.I.info },
         el("span", {}, el("strong", { texto: "Somente o e-mail é essencial para identificar a conta." }),
            " Os demais campos são opcionais.")),
      el("div", { class: "acoes" }, salvar, el("button", { type: "reset", class: "botao botao-secundario", texto: "Cancelar" })));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const d = new FormData(form), t = n => (d.get(n) || "").toString().trim() || null;
      RC.ocupado(salvar, () => atualizar({ nome_exibicao: t("nome_exibicao"), vinculo: t("vinculo"), curso_area: t("curso_area") },
                                        "Dados salvos."));
    });
    return form;
  }

  async function abaInteresses() {
    let areas = {};
    try { areas = (await RC.dados()).areas || {}; } catch (e) { /* segue com o que houver */ }
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar interesses" });
    const form = el("form", { class: "form" },
      titulo(RC.I.alvo, "Interesses", "As áreas e os tipos escolhidos viram os filtros da lista de oportunidades."),
      RC.grupoPilulas("Áreas de interesse", "area", areas, p.areas, "checkbox", RC.I.camadas),
      RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, p.tipos, "checkbox", RC.I.maleta),
      el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      RC.ocupado(salvar, () => atualizar({ areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo") },
                                        "Interesses salvos. A lista já usa suas escolhas.", RC.preferenciasMudaram));
    });
    return form;
  }

  function abaNotificacoes() {
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar notificações" });
    const form = el("form", { class: "form" },
      titulo(RC.I.sino, "Notificações", "Escolha como e com que frequência quer ser avisado(a)."),
      el("div", {},
        interruptor("quer_newsletter", p.quer_newsletter, RC.I.email, "Receber newsletter e alertas por e-mail",
                    "Novidades e oportunidades compatíveis com seus interesses. Você pode cancelar quando quiser.")),
      RC.grupoPilulas("Frequência dos alertas", "frequencia", RC.FREQUENCIAS, [p.frequencia], "radio", RC.I.calendario),
      RC.grupoPilulas("Canais", "canal", RC.CANAIS, p.canais, "checkbox", RC.I.aviao),
      AVISO_ENVIO(),
      el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      RC.ocupado(salvar, () => atualizar({
        quer_newsletter: form.elements.quer_newsletter.checked,
        frequencia: RC.marcados(form, "frequencia")[0] || "semanal", canais: RC.marcados(form, "canal"),
      }, "Preferências de notificação salvas."));
    });
    return form;
  }

  function abaPrivacidade() {
    const partes = [titulo(RC.I.escudo, "Privacidade e dados", "Seus dados, consentimentos e direitos (LGPD).")];
    if (precisaAceitar) {
      const aceitar = el("button", { type: "submit", class: "botao botao-primario", texto: "Aceitar e continuar" });
      const f = el("form", { class: "alerta-laranja form" },
        el("strong", { texto: "Atualizamos os Termos de Uso e a Política de Privacidade." }),
        el("label", { class: "marcar" }, el("input", { type: "checkbox", required: true }),
           el("span", {}, "Li e aceito os ", el("a", { href: "termos.html", target: "_blank", texto: "Termos de Uso" }),
              " e a ", el("a", { href: "privacidade.html", target: "_blank", texto: "Política de Privacidade" }),
              " (versão " + RC.config.versaoTermos + "), e declaro ter 18 anos ou mais.")),
        aceitar,
        el("p", { class: "areas", texto: "Se não quiser aceitar, você pode baixar seus dados e excluir a conta logo abaixo." }));
      f.addEventListener("submit", ev => {
        ev.preventDefault();
        if (!f.reportValidity()) return;
        RC.ocupado(aceitar, () => atualizar({ termos_versao: RC.config.versaoTermos }, "Termos aceitos. Obrigado!",
                                            () => location.replace("conta.html?aba=privacidade")));
      });
      partes.push(f);
    }
    partes.push(el("p", { class: "caixa-info", html: RC.I.escudo },
      el("span", {}, "Seguimos o princípio da ", el("strong", { texto: "minimização de dados" }),
         ": coletamos só o necessário para o Radar funcionar e para o que você autorizar.")));

    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Atualizar consentimentos" });
    const consent = el("form", { class: "form" },
      el("h3", { texto: "Consentimentos" }),
      el("p", { class: "areas", texto: p.consentimento_em
        ? "Termos de Uso e Política de Privacidade: versão " + p.termos_versao + ", aceitos em " + dataHora(p.consentimento_em) + "."
        : "Termos de Uso e Política de Privacidade: ainda não aceitos." }),
      el("div", {},
        interruptor("quer_newsletter", p.quer_newsletter, RC.I.email, "Newsletter e alertas por e-mail",
                    p.newsletter_em ? "Autorizado em " + dataHora(p.newsletter_em) + "." : "Não autorizado."),
        interruptor("aceita_pesquisa", p.aceita_pesquisa, RC.I.grafico, "Uso em estudos, sem identificação",
                    (p.pesquisa_em ? "Autorizado em " + dataHora(p.pesquisa_em) + ". " : "") +
                    "Seus dados, sem nome nem e-mail, em estudos sobre o acesso a oportunidades.")),
      salvar);
    consent.addEventListener("submit", ev => {
      ev.preventDefault();
      RC.ocupado(salvar, () => atualizar({ quer_newsletter: consent.elements.quer_newsletter.checked,
                                           aceita_pesquisa: consent.elements.aceita_pesquisa.checked },
                                         "Consentimentos atualizados.", () => desenharAba()));
    });
    partes.push(consent);

    const acao = (icone, t, d, fn, perigo) => {
      const b = el("button", { type: "button", class: perigo ? "perigo" : null, html: icone },
        el("div", {}, el("strong", { texto: t }), el("span", { texto: d })), el("span", { html: RC.I.seta }));
      b.addEventListener("click", () => fn(b));
      return b;
    };
    partes.push(el("h3", { texto: "Seus direitos" }), el("div", { class: "lista-acoes" },
      acao(RC.I.baixar, "Baixar meus dados", "Cópia de tudo o que está na sua conta, em arquivo JSON.", b => RC.ocupado(b, baixar)),
      acao(RC.I.documento, "Política de Privacidade e Termos", "Como tratamos seus dados e como exercer seus direitos.",
           () => { location.href = "privacidade.html"; }),
      acao(RC.I.lixeira, "Excluir minha conta", "Apaga na hora e de forma definitiva sua conta, perfil e favoritos.", excluir, true)));
    return el("div", { class: "form" }, ...partes);
  }

  async function baixar() {
    const [fav, cons] = await Promise.all([
      db.from("favoritos").select("item_id, criado_em").order("criado_em"),
      db.from("consentimentos").select("finalidade, concedido, versao, registrado_em").order("registrado_em")]);
    if (fav.error || cons.error) return RC.mensagem(painel, RC.traduzErro(fav.error || cons.error));
    const { data: u } = await db.auth.getUser();
    let filtros = null;
    try { filtros = JSON.parse(localStorage.getItem("radar-filtros")); } catch (e) { /* sem armazenamento */ }
    const copia = {
      gerado_em: new Date().toISOString(),
      conta: { id: u.user.id, email: u.user.email, criada_em: u.user.created_at, ultimo_acesso: u.user.last_sign_in_at },
      perfil: p, favoritos: fav.data, historico_de_consentimentos: cons.data,
      neste_aparelho: { filtros },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" }));
    const a = el("a", { href: url, download: "meus-dados-radar-de-oportunidades.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    RC.mensagem(painel, "Arquivo com seus dados baixado.", true);
  }

  function excluir(botao) {
    if (!window.confirm("Excluir sua conta apaga agora, de forma definitiva, seu cadastro, suas preferências, " +
                        "seus favoritos e o histórico de consentimentos. Não dá para desfazer. Continuar?")) return;
    RC.ocupado(botao, async () => {
      const { error } = await db.rpc("excluir_minha_conta");
      if (error) return RC.mensagem(painel, RC.traduzErro(error));
      await db.auth.signOut({ scope: "local" });
      try { localStorage.removeItem("radar-perfil-aplicado"); } catch (e) { /* ok */ }
      location.replace("entrar.html?motivo=excluida");
    });
  }

  function abaSeguranca() {
    const trocar = el("button", { type: "submit", class: "botao botao-primario", texto: "Salvar nova senha" });
    const nova = el("input", { type: "password", name: "nova", autocomplete: "new-password", required: true, minlength: "8" });
    const conf = el("input", { type: "password", name: "confirmar", autocomplete: "new-password", required: true, minlength: "8" });
    const conferir = () => {
      nova.setCustomValidity(/[a-zA-Z]/.test(nova.value) && /\d/.test(nova.value) ? "" : "Use letras e números na senha.");
      conf.setCustomValidity(conf.value && conf.value !== nova.value ? "As senhas não conferem." : "");
    };
    nova.addEventListener("input", conferir); conf.addEventListener("input", conferir);
    const form = el("form", { class: "form" },
      titulo(RC.I.cadeado, recuperando ? "Defina sua nova senha" : "Segurança", "A senha fica guardada só no serviço de autenticação, de forma protegida."),
      el("label", { class: "campo" }, "E-mail da conta", el("input", { value: s.user.email, readonly: true })),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, "Nova senha", el("span", { class: "senha" }, nova,
           el("button", { type: "button", class: "mostrar-senha", "aria-label": "Mostrar senha", "aria-pressed": "false", html: RC.I.olho }))),
        el("label", { class: "campo" }, "Confirmar nova senha", el("span", { class: "senha" }, conf,
           el("button", { type: "button", class: "mostrar-senha", "aria-label": "Mostrar senha", "aria-pressed": "false", html: RC.I.olho })))),
      el("p", { class: "areas", texto: "Pelo menos 8 caracteres, com letras e números." }),
      trocar);
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      conferir();
      if (!form.reportValidity()) return;
      RC.ocupado(trocar, async () => {
        const { error } = await db.auth.updateUser({ password: nova.value });
        if (error) return RC.mensagem(painel, RC.traduzErro(error));
        form.reset(); recuperando = false;
        RC.mensagem(painel, "Senha alterada.", true);
      });
    });
    const sair = el("button", { type: "button", class: "botao botao-secundario", html: RC.I.sair + "Sair deste aparelho" });
    const sairTodos = el("button", { type: "button", class: "botao botao-secundario", html: RC.I.sair + "Sair de todos os aparelhos" });
    sair.addEventListener("click", () => RC.ocupado(sair, async () => {
      await db.auth.signOut({ scope: "local" }); location.replace("entrar.html?motivo=saiu"); }));
    sairTodos.addEventListener("click", () => RC.ocupado(sairTodos, async () => {
      await db.auth.signOut({ scope: "global" }); location.replace("entrar.html?motivo=saiu"); }));
    return el("div", { class: "form" }, form, el("h3", { texto: "Acesso" }), el("div", { class: "acoes" }, sair, sairTodos));
  }

  async function desenharAba() {
    const f = { perfil: abaPerfil, interesses: abaInteresses, notificacoes: abaNotificacoes,
                privacidade: abaPrivacidade, seguranca: abaSeguranca }[aba];
    painel.replaceChildren(await f());
  }
  await desenharAba();
  if (recuperando) RC.mensagem(painel, "Você entrou pelo link de recuperação. Defina sua nova senha abaixo.", true);
  else if (precisaAceitar) RC.mensagem(painel, "Para continuar usando a conta, aceite a versão atual dos termos.");
})();
