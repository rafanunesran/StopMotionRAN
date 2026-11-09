/* Configuração do StopMotion RAN.
 * servidorUrl: endereço do app da Web do Google Apps Script (termina em /exec),
 * que roda na conta do professor. Veja apps-script/Servidor.gs e a seção
 * "Contas dos alunos e entrega no Google Drive" do README.
 *
 * Com o endereço preenchido:
 *   - o aluno cria um usuário e senha (guardados numa planilha no Drive do professor);
 *   - os projetos são salvos no Drive a cada 5 minutos e abrem em qualquer computador;
 *   - aparece o botão "Enviar ao professor", que manda o vídeo para a pasta da turma.
 * Vazio: o site funciona só neste dispositivo, sem login com senha. */
window.SMR_CONFIG = {
  servidorUrl: '',
};
