// conta.html?aba=perfil|interesses|acompanhando|notificacoes|privacidade|seguranca
import * as FB from "./firebase.js";
import { listaAcompanhando, seloMudou } from "./acompanhar.js";
const RC = window.RC, $ = id => document.getElementById(id), el = RC.el;

async function principal() {
  const u = await FB.exigirLogin();
  if (!u) return;
  await FB.montarTopo();
  const painel = $("painel"), params = new URLSearchParams(location.search);
  let p;
  try { p = await FB.lerPerfil(u.uid); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
  const semPerfil = !p, precisaAceitar = !p || p.termos_versao !== FB.VERSAO_TERMOS;

  const ABAS = [
    ["perfil", RC.I.pessoa, "Perfil", "Seus dados básicos"],
    ["interesses", RC.I.alvo, "Interesses", "Áreas, tipos, alcance e idioma"],
    ["acompanhando", RC.I.olhoAberto, "Acompanhando", "Prazos e mudanças dos salvos"],
    ["notificacoes", RC.I.sino, "Notificações", "Alertas e newsletter"],
    ["privacidade", RC.I.escudo, "Privacidade e dados", "Consentimentos e LGPD"],
    ["seguranca", RC.I.cadeado, "Segurança", "Senha e acesso"],
  ];
  let aba = params.get("aba");
  if (precisaAceitar) aba = "privacidade";
  if (!ABAS.some(a => a[0] === aba)) aba = "perfil";
  $("abas-conta").replaceChildren(...ABAS.map(([id, icone, t, d]) =>
    el("a", { href: "conta.html?aba=" + id, html: icone, "aria-current": id === aba ? "page" : null },
       el("div", {}, t, el("span", { texto: d })))));
  document.title = ABAS.find(a => a[0] === aba)[2] + " · Minha conta · Radar de Oportunidades";

  const titulo = (icone, t, d) => el("div", { class: "secao-titulo" }, el("span", { class: "ico", html: icone }),
    el("div", {}, el("h2", { texto: t }), d ? el("p", { texto: d }) : null));
  const quando = ts => ts && ts.toDate ? ts.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  const interruptor = (nome, marcado, icone, t, d) => el("label", { class: "linha-interruptor" }, el("span", { html: icone }),
    el("span", {}, el("strong", { texto: t }), el("span", { class: "desc", texto: d })),
    el("input", { type: "checkbox", class: "interruptor", role: "switch", name: nome, checked: marcado, "aria-checked": String(!!marcado) }));
  const AVISO_ENVIO = () => el("p", { class: "caixa-info", html: RC.I.info },
    el("span", { texto: "O envio de alertas e da newsletter começa em breve. Por enquanto, guardamos sua preferência." }));

  async function alterar(campos, ok, depois) {
    try { await FB.alterarPerfil(u.uid, campos, p); p = await FB.lerPerfil(u.uid); }
    catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
    if (depois) await depois();
    RC.mensagem(painel, ok, true);
  }

  // Pede a senha de novo (login recente) e repete a ação. Quem entrou só por
  // link pode receber um novo link e voltar para cá.
  function pedirSenha(acao, rotulo) {
    const senha = el("input", { type: "password", autocomplete: "current-password", required: true });
    const confirmar = el("button", { type: "submit", class: "botao botao-primario", texto: rotulo });
    const link = el("button", { type: "button", class: "link-botao", texto: "Entrei por link e não tenho senha: enviar novo link" });
    const f = el("form", { class: "alerta-laranja form" },
      el("strong", { texto: "Por segurança, confirme sua senha." }),
      el("label", { class: "campo" }, "Senha atual", el("span", { class: "senha" }, senha,
         el("button", { type: "button", class: "mostrar-senha", "aria-label": "Mostrar senha", "aria-pressed": "false", html: RC.I.olho }))),
      confirmar, link);
    f.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      RC.ocupado(confirmar, async () => {
        try { await FB.reautenticar(senha.value); } catch (e) { return RC.mensagem(f, FB.traduzErro(e)); }
        f.remove();
        await acao();
      });
    });
    link.addEventListener("click", () => RC.ocupado(link, async () => {
      try {
        await FB.enviarLink(u.email, "conta.html?aba=" + aba);
        RC.mensagem(f, "Enviamos um link para " + u.email + ". Abra-o neste aparelho e repita a ação.", true);
      } catch (e) { RC.mensagem(f, FB.traduzErro(e)); }
    }));
    return f;
  }

  // ---------------------------------------------------------------- abas
  function abaPerfil() {
    const uf = el("select", { name: "uf", required: true }, el("option", { value: "", texto: "Selecione" }),
      ...RC.UFS.map(v => el("option", { value: v, texto: v, selected: p.uf === v })),
      el("option", { value: "nao-informado", texto: "Prefiro não informar", selected: p.uf === "nao-informado" }));
    const opcional = t => el("span", {}, t + " ", el("span", { class: "opcional", texto: "Opcional" }));
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar alterações" });
    const form = el("form", { class: "form" },
      titulo(RC.I.pessoa, "Dados básicos", "Informações para personalizar o Radar."),
      el("label", { class: "campo" }, "E-mail", el("input", { value: u.email, readonly: true })),
      u.emailVerified ? null : verificar(),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, opcional("Nome de exibição"),
           el("input", { name: "nome_exibicao", value: p.nome_exibicao || "", maxlength: "120", autocomplete: "nickname" })),
        el("label", { class: "campo" }, el("span", {}, "Seu estado ", el("span", { class: "obrigatorio", "aria-hidden": "true", texto: "*" })), uf),
        el("label", { class: "campo" }, opcional("Curso ou área"),
           el("input", { name: "curso_area", value: p.curso_area || "", maxlength: "120" }))),
      RC.grupoVinculos(RC.vinculosDoPerfil(p), false),
      RC.camposAcademicos(p),
      el("p", { class: "caixa-info", html: RC.I.info },
         el("span", {}, el("strong", { texto: "Somente o e-mail é essencial para identificar a conta." }),
            " Os demais campos são opcionais. O que você é e seu estado servem para sugerir filtros e para o alcance (Estadual, Regional)." )),
      el("div", { class: "acoes" }, salvar, el("button", { type: "reset", class: "botao botao-secundario", texto: "Cancelar" })));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const d = new FormData(form), t = n => (d.get(n) || "").toString().trim() || null;
      RC.ocupado(salvar, () => alterar({ nome_exibicao: t("nome_exibicao"), ...RC.lerVinculos(form), uf: t("uf"),
                                         curso_area: t("curso_area"), ...RC.lerAcademicos(form) },
                                         "Dados salvos.", RC.preferenciasMudaram));
    });
    return form;
  }

  function verificar() {
    const b = el("button", { type: "button", class: "link-botao", texto: "Reenviar e-mail de confirmação" });
    b.addEventListener("click", () => RC.ocupado(b, async () => {
      try { await FB.enviarVerificacao(u); RC.mensagem(painel, "Enviamos o e-mail de confirmação para " + u.email + ".", true); }
      catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
    }));
    return el("p", { class: "alerta-laranja", html: RC.I.info }, el("span", {}, "Seu e-mail ainda não foi confirmado. ", b));
  }

  async function abaInteresses() {
    let areas = {}, emBreve = new Set();
    try { const d = await RC.dados(); areas = d.areas || {}; emBreve = RC.tiposEmBreve(d); } catch (e) { /* segue com o que houver */ }
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar interesses" });
    const form = el("form", { class: "form" },
      titulo(RC.I.alvo, "Interesses", "Áreas, tipos, alcance e idioma viram os filtros da lista de oportunidades."),
      RC.grupoPilulas("Áreas de interesse", "area", areas, p.areas, "checkbox", RC.I.camadas),
      RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, p.tipos, "checkbox", RC.I.maleta, null, emBreve),
      RC.grupoPilulas("Alcance", "alcance", RC.ALCANCES, p.alcances || [], "checkbox", RC.I.aviao,
        p.uf && p.uf !== "nao-informado" ? "Em relação ao seu estado (" + p.uf + ")." : "Sem estado no perfil, Estadual e Regional não se aplicam."),
      RC.grupoPilulas("Idioma", "idioma", RC.IDIOMAS, p.idiomas || [], "checkbox", RC.I.documento),
      el("p", { class: "areas" }, "Quer a sugestão pelo seu perfil? ", el("a", { href: "personalizar.html", texto: "Personalizar e restaurar sugestão" })),
      el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      RC.ocupado(salvar, () => alterar({ areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"),
                                         alcances: RC.marcados(form, "alcance"), idiomas: RC.marcados(form, "idioma") },
                                       "Interesses salvos. A lista já usa suas escolhas.", RC.preferenciasMudaram));
    });
    return form;
  }

  async function abaAcompanhando() {
    const caixa = el("div", { class: "form" });
    const desenharAba = async () => {
      let itens = [], favs = [];
      try { [itens, favs] = await Promise.all([RC.dados().then(d => d.itens), FB.listarFavoritos(u.uid)]); }
      catch (e) { return caixa.replaceChildren(el("p", { class: "msg", texto: FB.traduzErro(e) })); }
      const { ul, total } = listaAcompanhando(u.uid, itens, favs, desenharAba, t => RC.mensagem(painel, t));
      const porId = new Map(itens.map(i => [i.id, i]));
      const outros = favs.filter(f => !f.acompanhar && porId.has(f.item_id));
      const lista = el("ul", { class: "lista-acompanhando" }, ...outros.map(f => {
        const i = porId.get(f.item_id);
        const b = el("button", { type: "button", class: "botao botao-secundario", html: RC.I.olhoAberto + "Acompanhar" });
        b.addEventListener("click", () => RC.ocupado(b, async () => {
          try { await FB.definirAcompanhar(u.uid, f.item_id, true); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
          desenharAba();
        }));
        return el("li", {}, el("div", {},
            el("a", { href: "oportunidade.html?id=" + encodeURIComponent(i.id), texto: i.titulo }),
            el("div", { class: "areas", texto: i.fonte + " · " + RC.contagem(i.prazo) }),
            RC.mudouDesde(i, f) ? seloMudou() : null),
          el("div", { class: "acoes" }, b));
      }));
      caixa.replaceChildren(...[
        titulo(RC.I.olhoAberto, "Acompanhando", "Oportunidades salvas que você quer acompanhar de perto."),
        total ? ul : el("p", { class: "areas", texto: "Você ainda não acompanha nenhuma oportunidade. Abra uma oportunidade salva e ligue \u201cAcompanhar\u201d." }),
        el("p", { class: "caixa-info", html: RC.I.info }, el("span", { texto:
          "O selo \u201cMudou desde a sua última visita\u201d aparece quando o prazo mudou ou saiu retificação depois da última vez que você abriu a oportunidade." })),
        outros.length ? el("h3", { texto: "Outros favoritos" }) : null, outros.length ? lista : null,
      ].filter(Boolean));  // replaceChildren escreveria null como o texto "null"
    };
    await desenharAba();
    return caixa;
  }

  function abaNotificacoes() {
    const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Salvar notificações" });
    const form = el("form", { class: "form" },
      titulo(RC.I.sino, "Notificações", "Escolha como e com que frequência quer ser avisado(a)."),
      el("div", {}, interruptor("quer_newsletter", p.quer_newsletter, RC.I.email, "Receber newsletter e alertas por e-mail",
        p.newsletter_em ? "Autorizado em " + quando(p.newsletter_em) + ". Você pode cancelar quando quiser."
                        : "Novidades e oportunidades compatíveis com seus interesses. Opcional.")),
      RC.grupoPilulas("Frequência dos alertas", "frequencia", RC.FREQUENCIAS, [p.frequencia], "radio", RC.I.calendario),
      RC.grupoPilulas("Canais", "canal", RC.CANAIS, p.canais, "checkbox", RC.I.aviao),
      AVISO_ENVIO(), el("div", { class: "acoes" }, salvar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      RC.ocupado(salvar, () => alterar({
        quer_newsletter: form.elements.quer_newsletter.checked,
        frequencia: RC.marcados(form, "frequencia")[0] || "semanal", canais: RC.marcados(form, "canal"),
      }, "Preferências de notificação salvas.", () => desenhar()));
    });
    return form;
  }

  // Aceite dos termos: cria o perfil (quem entrou por link pela primeira vez)
  // ou registra a nova versão.
  function blocoAceite() {
    const termos = el("input", { type: "checkbox", required: true });
    const news = el("input", { type: "checkbox" });
    const aceitar = el("button", { type: "submit", class: "botao botao-primario", texto: "Aceitar e continuar" });
    const f = el("form", { class: "alerta-laranja form" },
      el("strong", { texto: semPerfil ? "Para usar a conta, aceite os Termos de Uso e a Política de Privacidade."
                                      : "Atualizamos os Termos de Uso e a Política de Privacidade." }),
      el("label", { class: "marcar" }, termos,
         el("span", {}, "Li e aceito os ", el("a", { href: "termos.html", target: "_blank", texto: "Termos de Uso" }),
            " e a ", el("a", { href: "privacidade.html", target: "_blank", texto: "Política de Privacidade" }),
            " (versão " + FB.VERSAO_TERMOS + "), e declaro ter 18 anos ou mais.")),
      semPerfil ? el("label", { class: "marcar" }, news, el("span", { texto: "Opcional: quero receber a newsletter e alertas por e-mail (o envio começa em breve)." })) : null,
      aceitar,
      el("p", { class: "areas", texto: "Se não quiser aceitar, você pode baixar seus dados e excluir a conta logo abaixo." }));
    f.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      RC.ocupado(aceitar, async () => {
        try {
          if (semPerfil) await FB.criarPerfil(u.uid, { quer_newsletter: news.checked });
          else await FB.alterarPerfil(u.uid, { termos_versao: FB.VERSAO_TERMOS }, p);
        } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
        location.replace(semPerfil ? "personalizar.html" : "conta.html?aba=privacidade");
      });
    });
    return f;
  }

  function abaPrivacidade() {
    const partes = [titulo(RC.I.escudo, "Privacidade e dados", "Seus dados, consentimentos e direitos (LGPD).")];
    if (precisaAceitar) partes.push(blocoAceite());
    partes.push(el("p", { class: "caixa-info", html: RC.I.escudo },
      el("span", {}, "Seguimos o princípio da ", el("strong", { texto: "minimização de dados" }),
         ": só o e-mail é obrigatório. Os dados da conta ficam no Firebase (Google), com o banco de dados em São Paulo.")));
    if (p) {
      const salvar = el("button", { type: "submit", class: "botao botao-primario", html: RC.I.check + "Atualizar consentimentos" });
      const consent = el("form", { class: "form" },
        el("h3", { texto: "Consentimentos" }),
        el("p", { class: "areas", texto: "Termos de Uso e Política de Privacidade: versão " + p.termos_versao +
                                          ", aceitos em " + quando(p.consentimento_em) + "." }),
        el("div", {}, interruptor("quer_newsletter", p.quer_newsletter, RC.I.email, "Newsletter e alertas por e-mail",
          p.newsletter_em ? "Autorizado em " + quando(p.newsletter_em) + "." : "Não autorizado.")),
        salvar);
      consent.addEventListener("submit", ev => {
        ev.preventDefault();
        RC.ocupado(salvar, () => alterar({ quer_newsletter: consent.elements.quer_newsletter.checked },
                                         "Consentimentos atualizados.", () => desenhar()));
      });
      partes.push(consent);
    }
    const acao = (icone, t, d, fn, perigo) => {
      const b = el("button", { type: "button", class: perigo ? "perigo" : null, html: icone },
        el("div", {}, el("strong", { texto: t }), el("span", { texto: d })), el("span", { html: RC.I.seta }));
      b.addEventListener("click", () => fn(b));
      return b;
    };
    const lugarExclusao = el("div", {});
    partes.push(el("h3", { texto: "Seus direitos" }), el("div", { class: "lista-acoes" },
      acao(RC.I.baixar, "Baixar meus dados", "Cópia de tudo o que está na sua conta, em arquivo JSON.", b => RC.ocupado(b, baixar)),
      acao(RC.I.documento, "Política de Privacidade e Termos", "Como tratamos seus dados e como exercer seus direitos.",
           () => { location.href = "privacidade.html"; }),
      acao(RC.I.lixeira, "Excluir minha conta", "Apaga na hora seus favoritos, seu perfil e sua conta.",
           () => lugarExclusao.replaceChildren(formExclusao()), true)), lugarExclusao);
    return el("div", { class: "form" }, ...partes);
  }

  async function baixar() {
    try {
      const copia = await FB.exportar();
      const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" }));
      const a = el("a", { href: url, download: "meus-dados-radar-de-oportunidades.json" });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      RC.mensagem(painel, "Arquivo com seus dados baixado.", true);
    } catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
  }

  // Exclusão: confirmação explícita + senha (login recente) antes de apagar.
  function formExclusao() {
    const certeza = el("input", { type: "checkbox", required: true });
    const senha = el("input", { type: "password", autocomplete: "current-password" });
    const excluir = el("button", { type: "submit", class: "botao botao-perigo", html: RC.I.lixeira + "Excluir definitivamente" });
    const f = el("form", { class: "alerta-laranja form", "aria-labelledby": "titulo-exclusao" },
      el("strong", { id: "titulo-exclusao", texto: "Excluir minha conta" }),
      el("p", { texto: "Apaga agora, de forma definitiva, seus favoritos, seu perfil e sua conta de login. Não dá para desfazer." }),
      el("label", { class: "marcar" }, certeza, el("span", { texto: "Entendo e quero excluir minha conta." })),
      el("label", { class: "campo" }, "Senha atual (se você criou uma)", el("span", { class: "senha" }, senha,
         el("button", { type: "button", class: "mostrar-senha", "aria-label": "Mostrar senha", "aria-pressed": "false", html: RC.I.olho }))),
      excluir);
    const executar = async () => {
      await FB.excluirConta();
      try { localStorage.removeItem("radar-perfil-aplicado"); } catch (e) { /* ok */ }
      location.replace("entrar.html?motivo=excluida");
    };
    f.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      RC.ocupado(excluir, async () => {
        try {
          if (senha.value) await FB.reautenticar(senha.value);
          await executar();
        } catch (e) {
          if (e.code === "auth/requires-recent-login") return f.replaceWith(pedirSenha(executar, "Confirmar e excluir"));
          RC.mensagem(f, FB.traduzErro(e));
        }
      });
    });
    setTimeout(() => certeza.focus(), 0);
    return f;
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
    const olho = () => el("button", { type: "button", class: "mostrar-senha", "aria-label": "Mostrar senha", "aria-pressed": "false", html: RC.I.olho });
    const form = el("form", { class: "form" },
      titulo(RC.I.cadeado, "Segurança", "A senha fica só no serviço de login do Firebase, protegida."),
      el("label", { class: "campo" }, "E-mail da conta", el("input", { value: u.email, readonly: true })),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, "Nova senha", el("span", { class: "senha" }, nova, olho())),
        el("label", { class: "campo" }, "Confirmar nova senha", el("span", { class: "senha" }, conf, olho()))),
      el("p", { class: "areas", texto: "Pelo menos 8 caracteres, com letras e números. Se você entrou só por link, use isto para criar uma senha." }),
      trocar);
    const lugar = el("div", {});
    const salvarSenha = async () => {
      await FB.trocarSenha(nova.value);
      form.reset();
      RC.mensagem(painel, "Senha alterada.", true);
    };
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      conferir();
      if (!form.reportValidity()) return;
      RC.ocupado(trocar, async () => {
        try { await salvarSenha(); }
        catch (e) {
          if (e.code === "auth/requires-recent-login") return lugar.replaceChildren(pedirSenha(salvarSenha, "Confirmar e trocar a senha"));
          RC.mensagem(painel, FB.traduzErro(e));
        }
      });
    });
    const sair = el("button", { type: "button", class: "botao botao-secundario", html: RC.I.sair + "Sair da conta" });
    sair.addEventListener("click", () => RC.ocupado(sair, async () => {
      await FB.sair(); location.replace("entrar.html?motivo=saiu");
    }));
    return el("div", { class: "form" }, form, lugar, el("h3", { texto: "Acesso" }), el("div", { class: "acoes" }, sair));
  }

  async function desenhar() {
    const f = semPerfil ? abaPrivacidade
      : { perfil: abaPerfil, interesses: abaInteresses, acompanhando: abaAcompanhando, notificacoes: abaNotificacoes, privacidade: abaPrivacidade, seguranca: abaSeguranca }[aba];
    painel.replaceChildren(await f());
  }
  await desenhar();
  if (precisaAceitar) RC.mensagem(painel, semPerfil ? "Falta só aceitar os termos para começar a usar sua conta."
                                                    : "Para continuar usando a conta, aceite a versão atual dos termos.");
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
