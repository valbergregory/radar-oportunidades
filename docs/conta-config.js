// Contas opcionais do Radar de Oportunidades (Supabase).
// Enquanto algum campo abaixo estiver vazio, o site funciona sem contas: não
// aparece "Entrar" e nada de dados pessoais é coletado.
// Passo a passo: supabase/LEIAME.md.
window.RADAR_CONTA = {
  // Project Settings > Data API > Project URL. Ex.: "https://abcdefghijkl.supabase.co"
  url: "",
  // Project Settings > API Keys > "Publishable key" (começa com sb_publishable_).
  // Ela é pública por natureza: a proteção dos dados está em supabase/esquema.sql.
  // NUNCA coloque aqui a "secret key" (sb_secret_...) nem a antiga "service_role".
  chavePublicavel: "",
  // Controlador dos dados (LGPD): quem responde pelos pedidos dos titulares.
  // Aparece na política de privacidade.
  controlador: { nome: "", email: "" },
  // Mude quando alterar termos.html ou privacidade.html: quem tem conta será
  // convidado a aceitar a nova versão.
  versaoTermos: "2026-11-25",
};
