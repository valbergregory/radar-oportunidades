// cadastro.html: cria a conta (só e-mail e senha obrigatórios), grava o perfil
// com o aceite e envia o e-mail de verificação.
import * as FB from "./firebase.js";
const RC = window.RC, $ = id => document.getElementById(id);

async function principal() {
  if (await FB.usuario()) return location.replace("conta.html");
  await FB.montarTopo();
  const painel = $("painel"), form = $("form-cadastro");
  $("lugar-vinculos").replaceWith(RC.grupoVinculos([], true));
  $("lugar-academicos").replaceWith(RC.camposAcademicos());
  for (const v of RC.UFS) $("uf").append(RC.el("option", { value: v, texto: v }));
  $("uf").append(RC.el("option", { value: "nao-informado", texto: "Prefiro não informar" }));
  let areas = {};
  try { areas = (await RC.dados()).areas || {}; } catch (e) { /* sem dados: só os tipos */ }
  $("preferencias").append(
    RC.grupoPilulas("Preferências iniciais", "area", areas, [], "checkbox", RC.I.camadas, "Áreas do seu interesse (opcional)"),
    RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, [], "checkbox", RC.I.maleta, "Tipos que deseja acompanhar (opcional)"));

  const senha = $("senha"), confirmar = $("confirmar");
  const conferir = () => {
    senha.setCustomValidity(/[a-zA-Z]/.test(senha.value) && /\d/.test(senha.value) ? "" : "Use letras e números na senha.");
    confirmar.setCustomValidity(confirmar.value && confirmar.value !== senha.value ? "As senhas não conferem." : "");
  };
  senha.addEventListener("input", conferir);
  confirmar.addEventListener("input", conferir);

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    conferir();
    if (!form.reportValidity()) return;
    const d = new FormData(form), t = n => (d.get(n) || "").toString().trim();
    RC.ocupado($("botao-criar"), async () => {
      let user;
      try { user = await FB.criarConta(t("email").toLowerCase(), senha.value); }
      catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
      try {
        await FB.criarPerfil(user.uid, {
          nome_exibicao: t("nome_exibicao"), ...RC.lerVinculos(form), uf: t("uf") || null, curso_area: t("curso_area"),
          ...RC.lerAcademicos(form),
          areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"), quer_newsletter: !!d.get("quer_newsletter"),
        });
      } catch (e) {
        // A conta existe, mas o perfil não. Antes o site seguia em silêncio para o
        // aceite (que grava um perfil mínimo); agora mostra o motivo e o caminho.
        RC.mensagem(painel, "Sua conta foi criada, mas não conseguimos salvar seu perfil. " + FB.traduzErro(e));
        painel.querySelector(".msg").append(" ",
          RC.el("a", { href: "conta.html?aba=privacidade&aceitar=1", texto: "Continuar mesmo assim" }));
        return;
      }
      await FB.enviarVerificacao(user).catch(() => {});
      RC.preferenciasMudaram();
      location.replace("personalizar.html?nova=1");
    });
  });
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
