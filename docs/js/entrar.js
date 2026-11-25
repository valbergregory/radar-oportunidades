// entrar.html: e-mail e senha, link mágico e recuperação de senha.
"use strict";
(async () => {
  const RC = window.RC, $ = id => document.getElementById(id);
  if (!(await RC.carregarSupabase())) return RC.indisponivel($("area"));
  const painel = $("painel"), form = $("form-entrar");
  const destino = RC.voltarPara();
  const params = new URLSearchParams(location.search);
  if (await RC.sessao()) return location.replace(destino);
  await RC.montarTopo();
  if (params.get("motivo") === "excluida") RC.mensagem(painel, "Sua conta e seus dados foram excluídos.", true);
  if (params.get("motivo") === "saiu") RC.mensagem(painel, "Você saiu da sua conta.", true);
  if (params.get("voltar")) $("link-cadastro").href = "cadastro.html?voltar=" + encodeURIComponent(destino);

  const email = () => $("email").value.trim().toLowerCase();
  function exigirEmail() {
    if ($("email").checkValidity() && email()) return true;
    $("email").reportValidity();
    return false;
  }
  // Para não revelar quem tem conta, as respostas de link e de recuperação são iguais.
  const GENERICA = "Se houver uma conta com este e-mail, você vai receber uma mensagem em instantes. " +
                   "Confira também a caixa de spam.";

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    RC.ocupado($("botao-entrar"), async () => {
      const { data, error } = await RC.cliente().auth.signInWithPassword({ email: email(), password: $("senha").value });
      if (error) return RC.mensagem(painel, RC.traduzErro(error));
      const p = await RC.perfil(data.session).catch(() => null);
      if (!p || p.termos_versao !== RC.config.versaoTermos) return location.replace("conta.html?aba=privacidade&aceitar=1");
      location.replace(destino);
    });
  });

  $("botao-link").addEventListener("click", () => {
    if (!exigirEmail()) return;
    RC.ocupado($("botao-link"), async () => {
      const { error } = await RC.cliente().auth.signInWithOtp({
        email: email(), options: { shouldCreateUser: false, emailRedirectTo: RC.enderecoAbsoluto(destino) } });
      if (error && (error.status === 429 || !error.status)) return RC.mensagem(painel, RC.traduzErro(error));
      RC.mensagem(painel, GENERICA + " Abra o link neste mesmo aparelho.", true);
    });
  });

  $("esqueci").addEventListener("click", () => {
    if (!exigirEmail()) return;
    RC.ocupado($("esqueci"), async () => {
      const { error } = await RC.cliente().auth.resetPasswordForEmail(email(), {
        redirectTo: RC.enderecoAbsoluto("conta.html?aba=seguranca&recuperar=1") });
      if (error && (error.status === 429 || !error.status)) return RC.mensagem(painel, RC.traduzErro(error));
      RC.mensagem(painel, GENERICA + " O link leva para a troca de senha.", true);
    });
  });
})();
