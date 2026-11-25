// entrar.html: e-mail e senha, link por e-mail (o login é concluído aqui) e
// recuperação de senha.
import * as FB from "./firebase.js";
const RC = window.RC, $ = id => document.getElementById(id);
const painel = $("painel"), form = $("form-entrar");
const destino = RC.voltarPara();
const params = new URLSearchParams(location.search);
// Para não revelar quem tem conta, link e recuperação dão a mesma resposta.
const GENERICA = "Se houver uma conta com este e-mail, a mensagem chega em instantes. Confira também a caixa de spam.";

async function depoisDeEntrar(user) {
  const p = await FB.lerPerfil(user.uid).catch(() => null);
  if (!p || p.termos_versao !== FB.VERSAO_TERMOS) return location.replace("conta.html?aba=privacidade&aceitar=1");
  location.replace(destino);
}

async function concluirLinkDeEntrada() {
  const limparEndereco = () => history.replaceState(null, "", "entrar.html" + (params.get("voltar") ? "?voltar=" + encodeURIComponent(destino) : ""));
  const email = FB.emailDoLink();
  if (email) {
    try { const u = await FB.concluirLink(email); limparEndereco(); return depoisDeEntrar(u); }
    catch (e) { limparEndereco(); return RC.mensagem(painel, FB.traduzErro(e)); }
  }
  // Link aberto em outro aparelho ou navegador: pede o e-mail para confirmar.
  const campo = RC.el("input", { type: "email", id: "email-link", autocomplete: "email", required: true });
  const botao = RC.el("button", { type: "submit", class: "botao botao-primario", texto: "Concluir entrada" });
  const f = RC.el("form", { class: "form" },
    RC.el("p", { texto: "Para concluir a entrada pelo link, confirme o e-mail para o qual ele foi enviado." }),
    RC.el("label", { class: "campo" }, "E-mail", campo), botao);
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!f.reportValidity()) return;
    RC.ocupado(botao, async () => {
      try { const u = await FB.concluirLink(campo.value.trim().toLowerCase()); limparEndereco(); await depoisDeEntrar(u); }
      catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
    });
  });
  form.replaceWith(f);
  campo.focus();
}

async function principal() {
  if (await FB.ehLinkDeEntrada()) return concluirLinkDeEntrada();
  if (await FB.usuario()) return location.replace(destino);
  await FB.montarTopo();
  if (params.get("motivo") === "excluida") RC.mensagem(painel, "Sua conta e seus dados foram excluídos.", true);
  if (params.get("motivo") === "saiu") RC.mensagem(painel, "Você saiu da sua conta.", true);
  if (params.get("voltar")) $("link-cadastro").href = "cadastro.html?voltar=" + encodeURIComponent(destino);

  const email = () => $("email").value.trim().toLowerCase();
  const exigirEmail = () => ($("email").checkValidity() && email()) || ($("email").reportValidity(), false);

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    RC.ocupado($("botao-entrar"), async () => {
      try { await depoisDeEntrar(await FB.entrarComSenha(email(), $("senha").value)); }
      catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
    });
  });
  $("botao-link").addEventListener("click", () => {
    if (!exigirEmail()) return;
    RC.ocupado($("botao-link"), async () => {
      try { await FB.enviarLink(email(), destino); RC.mensagem(painel, GENERICA + " Abra o link de preferência neste aparelho.", true); }
      catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
    });
  });
  $("esqueci").addEventListener("click", () => {
    if (!exigirEmail()) return;
    RC.ocupado($("esqueci"), async () => {
      try { await FB.recuperarSenha(email()); RC.mensagem(painel, GENERICA + " O link leva para a troca de senha.", true); }
      catch (e) { RC.mensagem(painel, FB.traduzErro(e)); }
    });
  });
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
