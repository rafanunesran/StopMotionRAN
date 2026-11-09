/**
 * StopMotion RAN — recebimento de trabalhos no Google Drive do professor.
 *
 * Como usar (resumo; o passo a passo completo está no README do site):
 *   1. Crie uma pasta no seu Google Drive e copie o ID dela (a parte do link
 *      depois de /folders/).
 *   2. Em https://script.google.com crie um projeto novo, apague o conteúdo
 *      e cole este arquivo inteiro. Troque PASTA_ID abaixo.
 *   3. Rode a função "testarPasta" uma vez e autorize o acesso.
 *   4. Implantar > Nova implantação > Tipo "App da Web":
 *        Executar como: Eu        Quem pode acessar: Qualquer pessoa
 *   5. Copie o URL do app da Web (termina em /exec) e coloque em js/config.js.
 *
 * O script roda com a SUA conta, então os alunos não precisam de conta Google.
 * Os vídeos ficam em subpastas por turma dentro da pasta escolhida.
 */

// ID da pasta do professor no Google Drive.
const PASTA_ID = 'COLE_AQUI_O_ID_DA_PASTA';

// Tamanho máximo aceito por vídeo (bytes).
const TAMANHO_MAX = 300 * 1024 * 1024;

const TIPOS_ACEITOS = ['video/mp4', 'video/webm'];
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/** Rode esta função uma vez no editor para autorizar e conferir a pasta. */
function testarPasta() {
  const pasta = DriveApp.getFolderById(PASTA_ID);
  // Chamada simples só para o Google pedir também a permissão de "serviço externo".
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', { muteHttpExceptions: true });
  Logger.log('Tudo certo! Os trabalhos vão para a pasta: ' + pasta.getName());
}

function doGet() {
  return responder({ ok: true, app: 'StopMotion RAN - entregas' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.acao === 'iniciar') return responder(iniciar(req));
    if (req.acao === 'parte') return responder(enviarParte(req));
    throw new Error('Ação desconhecida.');
  } catch (err) {
    return responder({ ok: false, erro: String((err && err.message) || err) });
  }
}

/** Cria a sessão de envio no Drive (na subpasta da turma) e devolve o endereço dela. */
function iniciar(req) {
  const tipo = String(req.tipo || '').split(';')[0];
  if (TIPOS_ACEITOS.indexOf(tipo) < 0) throw new Error('Tipo de arquivo não permitido.');
  const tamanho = Number(req.tamanho);
  if (!(tamanho > 0 && tamanho <= TAMANHO_MAX)) throw new Error('Vídeo grande demais.');

  const aluno = limpar(req.aluno) || 'Aluno sem nome';
  const turma = limpar(req.turma) || 'Sem turma';
  const titulo = limpar(req.titulo) || 'Sem nome';
  const escola = limpar(req.escola);
  const tarefa = limpar(req.tarefa);
  const quando = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH'h'mm");
  const ext = tipo === 'video/mp4' ? 'mp4' : 'webm';
  const nome = turma + ' - ' + aluno + ' - ' + titulo + ' - ' + quando + '.' + ext;
  const descricao = 'Aluno: ' + aluno + '\nTurma: ' + turma + (escola ? '\nEscola: ' + escola : '') +
    (tarefa ? '\nTarefa: ' + tarefa : '') + '\nProjeto: ' + titulo + '\nQuadros: ' + (Number(req.quadros) || 0) + ' a ' + (Number(req.fps) || 0) + ' por segundo' +
    '\nEnviado pelo StopMotion RAN';

  const pasta = pastaDaTurma(turma, tarefa);
  const resp = UrlFetchApp.fetch(UPLOAD_URL + '?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': tipo,
      'X-Upload-Content-Length': String(tamanho),
    },
    payload: JSON.stringify({ name: nome, parents: [pasta.getId()], mimeType: tipo, description: descricao }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('O Google Drive recusou o envio (' + resp.getResponseCode() + ').');
  }
  const h = resp.getHeaders();
  const sessao = h.Location || h.location;
  if (!sessao) throw new Error('O Google Drive não devolveu o endereço de envio.');
  return { ok: true, sessao: sessao, nome: nome };
}

/** Repassa um pedaço do vídeo (em base64) para a sessão de envio do Drive. */
function enviarParte(req) {
  const sessao = String(req.sessao || '');
  if (sessao.indexOf(UPLOAD_URL + '?') !== 0) throw new Error('Sessão de envio inválida.');
  const inicio = Number(req.inicio);
  const total = Number(req.total);
  const bytes = Utilities.base64Decode(String(req.dados || ''));
  if (!bytes.length || !(inicio >= 0) || !(total > 0) || inicio + bytes.length > total) {
    throw new Error('Pedaço do vídeo inválido.');
  }
  const fim = inicio + bytes.length - 1;
  const resp = UrlFetchApp.fetch(sessao, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + inicio + '-' + fim + '/' + total },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const code = resp.getResponseCode();
  if (code === 308) return { ok: true, completo: false };
  if (code === 200 || code === 201) {
    const arq = JSON.parse(resp.getContentText());
    return {
      ok: true, completo: true, nome: arq.name, arquivoId: arq.id,
      arquivoUrl: arq.webViewLink || ('https://drive.google.com/file/d/' + arq.id + '/view'),
    };
  }
  throw new Error('Falha ao enviar parte do vídeo (' + code + ').');
}

/** Pasta da turma (e da tarefa, se houver) dentro da pasta do professor. */
function pastaDaTurma(turma, tarefa) {
  const raiz = DriveApp.getFolderById(PASTA_ID);
  // Evita criar duas pastas iguais quando vários alunos enviam ao mesmo tempo.
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const sub = (pai, nome) => {
      const it = pai.getFoldersByName(nome);
      return it.hasNext() ? it.next() : pai.createFolder(nome);
    };
    const pastaTurma = sub(raiz, turma);
    return tarefa ? sub(pastaTurma, tarefa) : pastaTurma;
  } finally {
    trava.releaseLock();
  }
}

function limpar(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
