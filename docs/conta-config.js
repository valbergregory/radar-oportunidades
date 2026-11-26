// Contas opcionais do Radar de Oportunidades (Firebase Authentication + Firestore).
// Com apiKey vazia (ou sem este arquivo), o site funciona sem contas: não
// aparece "Entrar", o SDK do Firebase nem é baixado e nenhum dado pessoal é
// coletado. Passo a passo: CONTAS.md.
//
// Os valores de firebaseConfig identificam o app da Web e são públicos por
// natureza: quem protege os dados são as regras (firestore.rules).
// NUNCA coloque aqui chaves de conta de serviço (arquivos JSON com private_key).
window.RADAR_CONTA = {
  firebase: {
    apiKey: "AIzaSyCwQuDFZc5sVkcAZZVYH8LHC-CAk5Ow3_I",
    authDomain: "radar-oportunidades-88442.firebaseapp.com",
    projectId: "radar-oportunidades-88442",
    storageBucket: "radar-oportunidades-88442.firebasestorage.app",
    messagingSenderId: "526795346378",
    appId: "1:526795346378:web:f3c5d445d3ea0ed9f8ff33",
  },
  // Controlador dos dados (LGPD): quem responde pelos pedidos dos titulares.
  // Aparece na política de privacidade. Recomendado preencher antes de divulgar.
  controlador: { nome: "Valber Gregory Barbosa Costa Bezerra Santos", email: "valber.gregory@gmail.com" },
  // Mude quando alterar termos.html ou privacidade.html: quem tem conta será
  // convidado a aceitar a nova versão.
  versaoTermos: "2026-11-26",
};
