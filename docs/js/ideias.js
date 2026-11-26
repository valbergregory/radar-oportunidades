// ideias.html?aba=mural|nova|minhas — mural de ideias com apoios (só com conta).
// O formulário guiado "adequa" a ideia: sugere a categoria, mostra ideias
// parecidas antes de enviar e escreve o resumo padronizado (js/ideias-regras.js).
// Ninguém vê quem escreveu nem quem apoiou; quem administra (admins/{uid}) muda
// o status, responde e marca repetidas.
import * as FB from "./firebase.js";
const RC = window.RC, R = window.RADAR_IDEIAS, el = RC.el, $ = id => document.getElementById(id);
const QUEM = { todos: "Todas as pessoas", ...Object.fromEntries(Object.entries(RC.VINCULOS).filter(([v]) => v !== "nao-informado")) };
const ENCERRADOS = new Set(["feita", "nao-sera-feita", "duplicada"]);
const quando = ts => ts && ts.toDate ? RC.fmtData.format(ts.toDate()) : "agora";
const ms = ts => ts && ts.toMillis ? ts.toMillis() : Date.now();

async function principal() {
  await FB.montarTopo();
  const painel = $("painel"), u = await FB.usuario();
  if (!u) return semConta(painel);
  let p;
  try { p = await FB.lerPerfil(u.uid); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
  if (!p || p.termos_versao !== FB.VERSAO_TERMOS) {
    return painel.replaceChildren(el("p", { class: "alerta-laranja" }, "Para usar o mural, aceite antes os termos atuais. ",
      el("a", { href: "conta.html?aba=privacidade&aceitar=1", texto: "Aceitar os termos" })));
  }

  let ideias = [], minhas = new Set(), apoiadas = new Set(), admin = false;
  async function carregar() {
    [ideias, minhas, apoiadas, admin] = await Promise.all([
      FB.listarIdeias(), FB.minhasIdeias(u.uid), FB.meusApoios(u.uid), FB.souAdmin(u.uid)]);
  }
  try { await carregar(); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }

  const params = new URLSearchParams(location.search);
  let aba = ["mural", "nova", "minhas"].includes(params.get("aba")) ? params.get("aba") : "mural";
  let filtro = { categoria: "", status: "abertas", ordem: "apoios" };
  let editando = null;  // ideia em edição no formulário

  // ---------------------------------------------------------------- abas
  function desenharAbas() {
    const abas = $("abas-ideias");
    abas.hidden = false;
    const botao = (id, texto) => {
      const b = el("button", { type: "button", role: "tab", "aria-selected": String(aba === id), id: "aba-" + id, texto });
      b.addEventListener("click", () => irPara(id));
      return b;
    };
    abas.replaceChildren(botao("mural", `Mural (${ideias.length})`), botao("nova", editando ? "Editar ideia" : "Nova ideia"),
      botao("minhas", `Minhas ideias (${minhas.size})`));
  }
  function irPara(id, msg, ok) {
    aba = id;
    if (id !== "nova") editando = null;
    history.replaceState(null, "", "ideias.html?aba=" + id);
    desenhar();
    if (msg) RC.mensagem(painel, msg, ok);
  }
  function desenhar() {
    desenharAbas();
    painel.setAttribute("aria-labelledby", "aba-" + aba);
    painel.replaceChildren(...[
      admin ? el("p", { class: "selo-admin", texto: "Você administra o mural: pode mudar o status, responder e marcar ideias repetidas." }) : null,
      aba === "mural" ? mural() : aba === "nova" ? formulario() : minhasIdeias(),
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------- mural
  function mural() {
    const sel = (nome, rotulo, opcoes, valor) => {
      const s = el("select", { name: nome }, ...Object.entries(opcoes).map(([v, r]) => el("option", { value: v, texto: r, selected: v === valor })));
      s.addEventListener("change", () => { filtro[nome] = s.value; lista.replaceChildren(...itens()); contar(); });
      return el("label", { class: "campo" }, rotulo, s);
    };
    const filtros = el("div", { class: "grade-campos filtros-ideias" },
      sel("categoria", "Categoria", { "": "Todas", ...Object.fromEntries(Object.entries(R.CATEGORIAS).map(([k, c]) => [k, c.rotulo])) }, filtro.categoria),
      sel("status", "Situação", { abertas: "Em aberto", "": "Todas", ...R.STATUS }, filtro.status),
      sel("ordem", "Ordenar por", { apoios: "Mais apoiadas", recentes: "Mais recentes" }, filtro.ordem));
    const total = el("p", { class: "areas", "aria-live": "polite" });
    const lista = el("ul", { class: "lista-ideias" });
    function itens() {
      const vis = ideias.filter(i => (!filtro.categoria || i.categoria === filtro.categoria)
        && (filtro.status === "" || (filtro.status === "abertas" ? !ENCERRADOS.has(i.status) : i.status === filtro.status)))
        .sort(filtro.ordem === "apoios" ? (a, b) => (b.apoios - a.apoios) || (ms(b.criado_em) - ms(a.criado_em))
                                        : (a, b) => ms(b.criado_em) - ms(a.criado_em));
      return vis.length ? vis.map(cartao)
        : [el("li", { class: "areas", texto: ideias.length ? "Nenhuma ideia com esses filtros." : "Ainda não há ideias. Seja a primeira pessoa a propor!" })];
    }
    function contar() { total.textContent = lista.querySelectorAll(".ideia").length + " ideia(s) mostrada(s)."; }
    lista.replaceChildren(...itens());
    const nova = el("button", { type: "button", class: "botao botao-primario", texto: "Propor uma ideia" });
    nova.addEventListener("click", () => irPara("nova"));
    setTimeout(contar, 0);
    return el("div", { class: "form" }, el("div", { class: "acoes" }, nova), filtros, total, lista);
  }

  function cartao(i) {
    const minha = minhas.has(i.id), apoiou = apoiadas.has(i.id);
    const cat = R.CATEGORIAS[i.categoria] || R.CATEGORIAS.outro;
    const repetidaDe = i.duplicada_de && ideias.find(x => x.id === i.duplicada_de);
    const apoio = el("button", { type: "button", class: "botao botao-secundario apoiar", "aria-pressed": String(apoiou),
      disabled: minha || ENCERRADOS.has(i.status),
      "aria-label": (apoiou ? "Retirar apoio: " : "Apoiar: ") + i.titulo + ` (${i.apoios} apoio${i.apoios === 1 ? "" : "s"})` },
      (apoiou ? "✓ Apoiada" : "Apoiar") + ` · ${i.apoios}`);
    apoio.addEventListener("click", () => RC.ocupado(apoio, async () => {
      try { await FB.apoiar(u.uid, i.id, !apoiou); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
      if (apoiou) { apoiadas.delete(i.id); i.apoios--; } else { apoiadas.add(i.id); i.apoios++; }
      const novo = cartao(i); li.replaceWith(novo); novo.querySelector(".apoiar").focus();
    }));
    const acoes = [apoio];
    if (minha && i.status === "recebida") {
      const editar = el("button", { type: "button", class: "link-botao", texto: "Editar" });
      editar.addEventListener("click", () => { editando = i; irPara("nova"); });
      acoes.push(editar);
    }
    if (minha) {
      const apagar = el("button", { type: "button", class: "link-botao perigo-texto", texto: "Apagar" });
      apagar.addEventListener("click", async () => {
        if (!await RC.confirmar("Apagar esta ideia do mural? Os apoios dela também deixam de contar.", "Apagar ideia")) return apagar.focus();
        RC.ocupado(apagar, async () => {
          try { await FB.apagarIdeia(u.uid, i.id); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
          ideias = ideias.filter(x => x.id !== i.id); minhas.delete(i.id);
          irPara(aba, "Ideia apagada.", true);
        });
      });
      acoes.push(apagar);
    }
    const li = el("li", { class: "ideia", id: "ideia-" + i.id, "data-id": i.id },
      el("div", { class: "ideia-topo" },
        el("h3", { texto: i.titulo }),
        el("div", { class: "chips" },
          el("span", { class: "etq", texto: cat.rotulo }),
          el("span", { class: "etq status-ideia status-" + i.status, texto: R.STATUS[i.status] || i.status }),
          minha ? el("span", { class: "etq etq-minha", texto: "Sua ideia" }) : null)),
      el("p", { class: "resumo-ideia", texto: i.resumo }),
      el("details", {}, el("summary", { texto: "Detalhes" }),
        el("dl", { class: "detalhes-ideia" },
          el("dt", { texto: "Problema ou necessidade" }), el("dd", { texto: i.problema }),
          i.como_deveria ? el("dt", { texto: "Como deveria funcionar" }) : null, i.como_deveria ? el("dd", { texto: i.como_deveria }) : null,
          el("dt", { texto: "Para quem" }), el("dd", { texto: QUEM[i.para_quem] || i.para_quem }),
          el("dt", { texto: "Enviada em" }), el("dd", { texto: quando(i.criado_em) }))),
      i.resposta ? el("p", { class: "resposta-equipe" }, el("strong", { texto: "Resposta da equipe: " }), i.resposta) : null,
      repetidaDe ? el("p", { class: "areas" }, "Repetida de: ", el("a", { href: "#ideia-" + repetidaDe.id, texto: repetidaDe.titulo })) : null,
      el("div", { class: "acoes" }, ...acoes),
      admin ? moderacao(i) : null);
    return li;
  }

  // ----------------------------------------------------------- administração
  function moderacao(i) {
    const st = el("select", { name: "status" }, ...Object.entries(R.STATUS).map(([v, r]) => el("option", { value: v, texto: r, selected: v === i.status })));
    const cat = el("select", { name: "categoria" }, ...Object.entries(R.CATEGORIAS).map(([v, c]) => el("option", { value: v, texto: c.rotulo, selected: v === i.categoria })));
    const dup = el("select", { name: "duplicada_de" }, el("option", { value: "", texto: "Não é repetida" }),
      ...ideias.filter(x => x.id !== i.id).map(x => el("option", { value: x.id, texto: x.titulo, selected: x.id === i.duplicada_de })));
    const resp = el("textarea", { name: "resposta", rows: "2", maxlength: "1000", placeholder: "Resposta para quem propôs e para o mural (opcional)" });
    resp.value = i.resposta || "";
    const salvar = el("button", { type: "submit", class: "botao botao-primario", texto: "Salvar" });
    const remover = el("button", { type: "button", class: "botao botao-perigo", texto: "Remover do mural" });
    const f = el("form", { class: "moderacao form" }, el("strong", { texto: "Administração" }),
      el("div", { class: "grade-campos" }, el("label", { class: "campo" }, "Situação", st), el("label", { class: "campo" }, "Categoria", cat)),
      el("label", { class: "campo" }, "Repetida de", dup), el("label", { class: "campo" }, "Resposta", resp),
      el("div", { class: "acoes" }, salvar, remover));
    f.addEventListener("submit", ev => {
      ev.preventDefault();
      const campos = { status: dup.value ? "duplicada" : st.value, categoria: cat.value, duplicada_de: dup.value, resposta: resp.value.trim() };
      RC.ocupado(salvar, async () => {
        try { await FB.moderarIdeia(i.id, campos); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
        Object.assign(i, { ...campos, duplicada_de: campos.duplicada_de || null, resposta: campos.resposta || null });
        irPara(aba, "Ideia atualizada.", true);
      });
    });
    remover.addEventListener("click", async () => {
      if (!await RC.confirmar("Remover esta ideia do mural (moderação)?", "Remover do mural")) return remover.focus();
      RC.ocupado(remover, async () => {
        try { await FB.moderarApagar(i.id); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
        ideias = ideias.filter(x => x.id !== i.id);
        irPara(aba, "Ideia removida do mural.", true);
      });
    });
    return f;
  }

  // ------------------------------------------------------- formulário guiado
  function formulario() {
    const e = editando || {};
    const titulo = el("input", { name: "titulo", id: "ideia-titulo", required: true, minlength: "5", maxlength: "100", value: e.titulo || "",
                                  placeholder: "Ex.: Filtro por curso" });
    const problema = el("textarea", { name: "problema", id: "ideia-problema", required: true, minlength: "10", maxlength: "1000", rows: "4",
                                      placeholder: "O que falta ou o que atrapalha hoje? Ex.: vejo editais de todos os cursos e perco os do meu." });
    problema.value = e.problema || "";
    const como = el("textarea", { name: "como_deveria", id: "ideia-como", maxlength: "1000", rows: "3",
                                  placeholder: "Ex.: poder escolher meu curso e ver só os editais dele." });
    como.value = e.como_deveria || "";
    const quem = el("select", { name: "para_quem", id: "ideia-quem" },
      ...Object.entries(QUEM).map(([v, r]) => el("option", { value: v, texto: r, selected: v === (e.para_quem || "todos") })));
    const cat = el("select", { name: "categoria", id: "ideia-categoria" },
      ...Object.entries(R.CATEGORIAS).map(([v, c]) => el("option", { value: v, texto: c.rotulo, title: c.dica, selected: v === (e.categoria || "outro") })));
    let categoriaManual = !!editando;
    cat.addEventListener("change", () => { categoriaManual = true; previa(); });
    const dicaCat = el("span", { class: "areas", id: "dica-categoria" });
    const explicar = () => { dicaCat.textContent = (R.CATEGORIAS[cat.value] || R.CATEGORIAS.outro).dica + ". Sugerida pelo texto; troque se não combinar."; };
    cat.setAttribute("aria-describedby", "dica-categoria");

    const parecidas = el("div", { class: "parecidas", id: "parecidas", "aria-live": "polite" });
    const resumo = el("p", { class: "resumo-ideia", id: "previa-resumo" });
    const selo = el("span", { class: "etq" });
    const enviar = el("button", { type: "submit", class: "botao botao-primario", texto: editando ? "Salvar alterações" : "Enviar ideia" });
    const cancelar = el("button", { type: "button", class: "botao botao-secundario", texto: "Cancelar" });
    cancelar.addEventListener("click", () => irPara(editando ? "minhas" : "mural"));

    function campos() {
      const c = { titulo: titulo.value.trim(), problema: problema.value.trim(), como_deveria: como.value.trim(), para_quem: quem.value, categoria: cat.value };
      c.resumo = R.resumo(c, QUEM);
      return c;
    }
    function previa() {
      const texto = titulo.value + " " + problema.value + " " + como.value;
      if (!categoriaManual) cat.value = R.classificar(texto);
      explicar();
      const c = campos();
      selo.textContent = R.CATEGORIAS[c.categoria].rotulo;
      resumo.textContent = c.problema.length >= 10 ? c.resumo : "Preencha o problema para ver o resumo.";
      const outras = R.parecidas(texto, ideias.filter(i => i.id !== e.id && !ENCERRADOS.has(i.status)));
      parecidas.replaceChildren(...(outras.length ? [
        el("strong", { texto: "Já existe ideia parecida? Apoiar uma que já está no mural dá mais força a ela:" }),
        el("ul", {}, ...outras.map(i => {
          const ja = apoiadas.has(i.id), minha = minhas.has(i.id);
          const b = el("button", { type: "button", class: "botao botao-secundario", disabled: ja || minha,
                                   texto: minha ? "Sua ideia" : ja ? "✓ Já apoiada" : "Apoiar esta" });
          b.addEventListener("click", () => RC.ocupado(b, async () => {
            try { await FB.apoiar(u.uid, i.id, true); } catch (er) { return RC.mensagem(painel, FB.traduzErro(er)); }
            apoiadas.add(i.id); i.apoios++;
            irPara("mural", "Obrigado! Você apoiou “" + i.titulo + "”.", true);
          }));
          return el("li", {}, el("span", {}, el("strong", { texto: i.titulo }), ` · ${i.apoios} apoio(s)`), b);
        }))] : []));
    }
    for (const c of [titulo, problema, como, quem]) c.addEventListener("input", previa);

    const form = el("form", { class: "form", id: "form-ideia" },
      el("p", { class: "caixa-info", html: RC.I.info }, el("span", { texto:
        "Sua ideia aparece no mural sem o seu nome. O site sugere a categoria, mostra ideias parecidas e escreve um resumo padronizado, para a equipe transformar a ideia em melhoria." })),
      el("label", { class: "campo" }, el("span", {}, "Título ", el("span", { class: "obrigatorio", "aria-hidden": "true", texto: "*" })), titulo),
      el("label", { class: "campo" }, el("span", {}, "Qual é o problema ou a necessidade? ", el("span", { class: "obrigatorio", "aria-hidden": "true", texto: "*" })), problema),
      el("label", { class: "campo" }, el("span", {}, "Como deveria funcionar? ", el("span", { class: "opcional", texto: "Opcional" })), como),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, "Para quem é", quem),
        el("label", { class: "campo" }, "Categoria", cat, dicaCat)),
      parecidas,
      el("div", { class: "previa-ideia" }, el("strong", { texto: "Sua ideia ficará assim no mural:" }), el("div", {}, selo), resumo),
      el("p", { class: "areas", texto: "Não escreva nome, telefone, e-mail ou outros dados pessoais: o texto fica visível para quem tem conta." }),
      el("div", { class: "acoes" }, enviar, cancelar));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const c = campos();
      RC.ocupado(enviar, async () => {
        try {
          if (editando) { await FB.editarIdeia(editando.id, c); Object.assign(editando, c); }
          else { await FB.criarIdeia(u.uid, c); }
          await carregar();
        } catch (er) { return RC.mensagem(painel, FB.traduzErro(er)); }
        irPara("minhas", editando ? "Ideia atualizada." : "Ideia enviada! Ela já está no mural, e você acompanha a situação dela aqui.", true);
      });
    });
    setTimeout(previa, 0);
    return form;
  }

  // ---------------------------------------------------------- minhas ideias
  function minhasIdeias() {
    const existentes = ideias.filter(i => minhas.has(i.id)).sort((a, b) => ms(b.criado_em) - ms(a.criado_em));
    const removidas = [...minhas].filter(id => !ideias.some(i => i.id === id));
    const partes = [el("p", { class: "areas", texto:
      "Situações: Recebida → Em análise → Planejada → Feita. Você pode editar enquanto a ideia está como “Recebida” e apagar quando quiser." })];
    if (!existentes.length && !removidas.length) {
      const b = el("button", { type: "button", class: "botao botao-primario", texto: "Propor uma ideia" });
      b.addEventListener("click", () => irPara("nova"));
      partes.push(el("p", { texto: "Você ainda não propôs nenhuma ideia." }), b);
    }
    if (existentes.length) partes.push(el("ul", { class: "lista-ideias" }, ...existentes.map(cartao)));
    for (const id of removidas) {
      const b = el("button", { type: "button", class: "link-botao", texto: "Tirar da lista" });
      b.addEventListener("click", () => RC.ocupado(b, async () => {
        try { await FB.apagarIdeia(u.uid, id); } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
        minhas.delete(id); irPara("minhas");
      }));
      partes.push(el("p", { class: "areas" }, "Uma ideia sua foi removida do mural pela moderação. ", b));
    }
    return el("div", { class: "form" }, ...partes);
  }

  desenhar();
}

function semConta(painel) {
  painel.replaceChildren(el("div", { class: "form" },
    el("p", { texto: "O mural de ideias é para quem tem conta: assim você acompanha a situação das suas ideias e apoia as dos colegas (sem que ninguém veja quem escreveu ou apoiou)." }),
    el("div", { class: "acoes" },
      el("a", { class: "botao botao-primario", href: "entrar.html?voltar=" + encodeURIComponent("ideias.html"), texto: "Entrar" }),
      el("a", { class: "botao botao-secundario", href: "cadastro.html", texto: "Criar conta" })),
    el("p", { class: "areas", texto: "Prefere não criar conta? Use “Dar sugestão” no topo da página: é anônimo." })));
}

if (!FB.configurado) RC.indisponivel($("conteudo"));
else principal();
