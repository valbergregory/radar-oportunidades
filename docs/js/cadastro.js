// cadastro.html: cria a conta (só e-mail e senha obrigatórios), grava o perfil
// com o aceite e envia o e-mail de verificação.
import * as FB from "./firebase.js";
const RC = window.RC, $ = id => document.getElementById(id);

async function principal() {
  if (await FB.usuario()) return location.replace("conta.html");
  await FB.montarTopo();
  const painel = $("painel"), form = $("form-cadastro");
  for (const [v, r] of Object.entries(RC.VINCULOS)) $("vinculo").append(RC.el("option", { value: v, texto: r }));
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
          nome_exibicao: t("nome_exibicao"), vinculo: t("vinculo") || null, curso_area: t("curso_area"),
          areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"), quer_newsletter: !!d.get("quer_newsletter"),
        });
      } catch (e) {
        // A conta existe, mas o perfil não: o aceite será pedido de novo em conta.html.
        return location.replace("conta.html?aba=privacidade&aceitar=1");
      }
      await FB.enviarVerificacao(user).catch(() => {});
      RC.preferenciasMudaram();
      location.replace("personalizar.html?nova=1");
    });
  });
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
