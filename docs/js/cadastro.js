// cadastro.html: cria a conta. Só e-mail e senha são obrigatórios; o resto vai
// em options.data e o banco copia para perfis (ver supabase/esquema.sql).
"use strict";
(async () => {
  const RC = window.RC, $ = id => document.getElementById(id);
  if (!(await RC.carregarSupabase())) return RC.indisponivel($("area"));
  if (await RC.sessao()) return location.replace("conta.html");
  await RC.montarTopo();
  const painel = $("painel"), form = $("form-cadastro");
  for (const [v, r] of Object.entries(RC.VINCULOS)) $("vinculo").append(RC.el("option", { value: v, texto: r }));

  let areas = {};
  try { areas = (await RC.dados()).areas || {}; } catch (e) { /* sem dados: só os tipos */ }
  $("preferencias").append(
    RC.grupoPilulas("Preferências iniciais", "area", areas, [], "checkbox", RC.I.camadas, "Áreas do seu interesse (opcional)"),
    RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, [], "checkbox", RC.I.maleta, "Tipos que deseja acompanhar (opcional)"));

  const senha = $("senha"), confirmar = $("confirmar");
  function conferirSenhas() {
    senha.setCustomValidity(/[a-zA-Z]/.test(senha.value) && /\d/.test(senha.value) ? "" :
                            "Use letras e números na senha.");
    confirmar.setCustomValidity(confirmar.value && confirmar.value !== senha.value ? "As senhas não conferem." : "");
  }
  senha.addEventListener("input", conferirSenhas);
  confirmar.addEventListener("input", conferirSenhas);

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    conferirSenhas();
    if (!form.reportValidity()) return;
    const d = new FormData(form), texto = n => (d.get(n) || "").toString().trim();
    const email = texto("email").toLowerCase();
    RC.ocupado($("botao-criar"), async () => {
      const { data, error } = await RC.cliente().auth.signUp({
        email, password: senha.value,
        options: {
          emailRedirectTo: RC.enderecoAbsoluto("personalizar.html"),
          data: {
            nome_exibicao: texto("nome_exibicao"), vinculo: texto("vinculo"), curso_area: texto("curso_area"),
            areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"),
            quer_newsletter: !!d.get("quer_newsletter"), termos_versao: RC.config.versaoTermos,
          },
        },
      });
      if (error) return RC.mensagem(painel, RC.traduzErro(error));
      RC.preferenciasMudaram();
      if (data.session) return location.replace("personalizar.html");
      // Confirmação por e-mail ligada (ou e-mail já cadastrado: a resposta é a mesma).
      painel.replaceChildren(RC.el("div", { class: "form" },
        RC.el("h2", { texto: "Confirme seu e-mail" }),
        RC.el("p", {}, "Enviamos um link de confirmação para ", RC.el("strong", { texto: email }),
              ". Abra o link para ativar a conta e escolher suas preferências."),
        RC.el("p", { class: "areas", texto: "Não chegou? Confira a caixa de spam. Se você já tinha conta, use “Entrar”." }),
        RC.el("a", { class: "botao botao-secundario", href: "entrar.html", texto: "Ir para Entrar" })));
      painel.querySelector("h2").setAttribute("tabindex", "-1");
      painel.querySelector("h2").focus();
    });
  });
})();
