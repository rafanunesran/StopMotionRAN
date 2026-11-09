/**
 * StopMotion RAN — servidor no Google Apps Script (roda na conta do professor).
 *
 * Faz duas coisas, tudo no Google Drive do professor:
 *   - Contas dos alunos: uma planilha "StopMotion RAN - Alunos" (criada sozinha
 *     dentro da pasta) guarda usuário, nome, turma e a senha protegida.
 *     Os projetos ficam em "Projetos dos alunos/<usuário>/<projeto>/".
 *   - Entregas: os vídeos enviados vão para "<turma>/" dentro da pasta.
 *
 * Instalação (passo a passo completo no README do site):
 *   1. Crie uma pasta no seu Google Drive e copie o ID dela (a parte do link
 *      depois de /folders/).
 *   2. Em https://script.google.com crie um projeto novo, apague o conteúdo
 *      e cole este arquivo inteiro. Troque PASTA_ID abaixo.
 *   3. Rode a função "testarPasta" uma vez e autorize o acesso.
 *   4. Implantar > Nova implantação > Tipo "App da Web":
 *        Executar como: Eu        Quem pode acessar: Qualquer pessoa
 *   5. Copie o URL do app da Web (termina em /exec) e coloque em js/config.js.
 *
 * Aluno esqueceu a senha? Na planilha, escreva uma senha nova na coluna
 * "Nova senha (professor)" da linha dele. Ele entra com ela e a coluna se apaga.
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
  const planilha = abrirPlanilha();
  // Chamada simples só para o Google pedir também a permissão de "serviço externo".
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', { muteHttpExceptions: true });
  Logger.log('Tudo certo! Os trabalhos vão para a pasta: ' + pasta.getName());
  Logger.log('Planilha de alunos: ' + planilha.getUrl());
}

function doGet() {
  return responder({ ok: true, app: 'StopMotion RAN - entregas' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.acao === 'iniciar') return responder(iniciar(req));
    if (req.acao === 'parte') return responder(enviarParte(req));
    if (req.acao === 'cadastrar') return responder(cadastrar(req));
    if (req.acao === 'entrar') return responder(entrar(req));
    if (req.acao === 'projetos') return responder(listarProjetos(req));
    if (req.acao === 'faltando') return responder(quadrosFaltando(req));
    if (req.acao === 'quadros') return responder(guardarQuadros(req));
    if (req.acao === 'salvar') return responder(salvarProjeto(req));
    if (req.acao === 'baixar') return responder(baixarQuadros(req));
    if (req.acao === 'apagar') return responder(apagarProjeto(req));
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

/* =====================================================================
 * Contas dos alunos (planilha) e projetos salvos na nuvem (Drive)
 * ===================================================================== */

const ABA = 'Alunos';
const COLUNAS = ['Usuário', 'Nome', 'Turma', 'Escola', 'Senha protegida', 'Nova senha (professor)', 'Criado em', 'Último acesso'];
const C = { usuario: 0, nome: 1, turma: 2, escola: 3, hash: 4, nova: 5, criado: 6, acesso: 7 };
const PASTA_PROJETOS = 'Projetos dos alunos';

function propriedades() { return PropertiesService.getScriptProperties(); }

/** Abre (ou cria na pasta do professor) a planilha de alunos. */
function abrirPlanilha() {
  const props = propriedades();
  const id = props.getProperty('PLANILHA_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* apagada: cria outra */ }
  }
  const ss = SpreadsheetApp.create('StopMotion RAN - Alunos');
  const aba = ss.getSheets()[0];
  aba.setName(ABA);
  aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]).setFontWeight('bold');
  aba.setFrozenRows(1);
  aba.getRange('A:A').setNumberFormat('@');
  aba.getRange('F:F').setNumberFormat('@');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(PASTA_ID));
  props.setProperty('PLANILHA_ID', ss.getId());
  return ss;
}

function abaAlunos() { return abrirPlanilha().getSheetByName(ABA); }

function segredo() {
  const props = propriedades();
  let s = props.getProperty('SEGREDO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SEGREDO', s); }
  return s;
}

function b64url(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }

function hashSenha(usuario, senha) {
  const sal = segredo() + '|' + usuario + '|';
  let d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + senha, Utilities.Charset.UTF_8);
  for (let i = 0; i < 100; i++) d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d.concat(Utilities.newBlob(sal).getBytes()));
  return b64url(d);
}

function criarToken(usuario) {
  return usuario + '.' + b64url(Utilities.computeHmacSha256Signature(usuario, segredo()));
}

/** Confere o token e devolve o usuário. */
function usuarioDoToken(token) {
  const t = String(token || '');
  const i = t.lastIndexOf('.');
  const usuario = t.slice(0, i);
  if (i < 1 || criarToken(usuario) !== t) throw new Error('Sessão expirada. Entre de novo.');
  return usuario;
}

function normalizarUsuario(u) {
  const v = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(v)) throw new Error('Usuário inválido: use de 3 a 30 letras sem acento, números, ponto, traço ou _.');
  return v;
}

function validarSenha(s) {
  const v = String(s || '');
  if (v.length < 4 || v.length > 60) throw new Error('A senha precisa ter pelo menos 4 caracteres.');
  return v;
}

function acharLinha(aba, usuario) {
  const n = aba.getLastRow();
  if (n < 2) return -1;
  const valores = aba.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i][0]).trim().toLowerCase() === usuario) return i + 2;
  }
  return -1;
}

function perfil(linha) {
  return { usuario: String(linha[C.usuario]), nome: String(linha[C.nome]), turma: String(linha[C.turma]), escola: String(linha[C.escola] || '') };
}

function cadastrar(req) {
  const usuario = normalizarUsuario(req.usuario);
  const senha = validarSenha(req.senha);
  const nome = limpar(req.nome);
  const turma = limpar(req.turma);
  if (!nome || !turma) throw new Error('Preencha nome e turma.');
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const aba = abaAlunos();
    if (acharLinha(aba, usuario) > 0) throw new Error('Esse usuário já existe. Escolha outro ou clique em Entrar.');
    const agora = new Date();
    const linha = [usuario, nome, turma, limpar(req.escola), hashSenha(usuario, senha), '', agora, agora];
    aba.appendRow(linha);
    return { ok: true, token: criarToken(usuario), perfil: perfil(linha) };
  } finally {
    trava.releaseLock();
  }
}

function entrar(req) {
  const usuario = String(req.usuario || '').trim().toLowerCase();
  const senha = String(req.senha || '');
  const aba = abaAlunos();
  const n = acharLinha(aba, usuario);
  if (n < 0) throw new Error('Usuário ou senha incorretos.');
  const linha = aba.getRange(n, 1, 1, COLUNAS.length).getValues()[0];
  const nova = String(linha[C.nova] || '').trim();
  if (nova && senha === nova) {
    // Senha redefinida pelo professor: passa a valer e some da planilha.
    aba.getRange(n, C.hash + 1, 1, 2).setValues([[hashSenha(usuario, senha), '']]);
  } else if (hashSenha(usuario, senha) !== String(linha[C.hash])) {
    throw new Error('Usuário ou senha incorretos.');
  }
  aba.getRange(n, C.acesso + 1).setValue(new Date());
  return { ok: true, token: criarToken(usuario), perfil: perfil(linha) };
}

/* ---------- pastas de projetos ---------- */

function subpasta(pai, nome, criar) {
  const it = pai.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return criar ? pai.createFolder(nome) : null;
}

function pastaDoAluno(usuario, criar) {
  const raiz = subpasta(DriveApp.getFolderById(PASTA_ID), PASTA_PROJETOS, criar);
  return raiz ? subpasta(raiz, usuario, criar) : null;
}

function idSeguro(id) {
  const v = String(id || '');
  if (!/^[A-Za-z0-9-]{1,64}$/.test(v)) throw new Error('Identificador inválido.');
  return v;
}

function pastaDoProjeto(usuario, projetoId, criar) {
  const aluno = pastaDoAluno(usuario, criar);
  return aluno ? subpasta(aluno, idSeguro(projetoId), criar) : null;
}

function lerJson(pasta, nome) {
  const it = pasta.getFilesByName(nome);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}

function listarProjetos(req) {
  const usuario = usuarioDoToken(req.token);
  const aluno = pastaDoAluno(usuario, false);
  const lista = [];
  if (aluno) {
    const it = aluno.getFolders();
    while (it.hasNext()) {
      const meta = lerJson(it.next(), 'projeto.json');
      if (meta) lista.push(meta);
    }
  }
  return { ok: true, projetos: lista };
}

function nomesDosQuadros(pasta) {
  const nomes = {};
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const n = f.getName();
    if (n !== 'projeto.json') nomes[n.replace(/\.[a-z]+$/, '')] = f;
  }
  return nomes;
}

function quadrosFaltando(req) {
  const usuario = usuarioDoToken(req.token);
  const pasta = pastaDoProjeto(usuario, req.projetoId, true);
  const tem = nomesDosQuadros(pasta);
  const ids = (req.ids || []).map(idSeguro);
  return { ok: true, faltando: ids.filter((id) => !tem[id]) };
}

function guardarQuadros(req) {
  const usuario = usuarioDoToken(req.token);
  const pasta = pastaDoProjeto(usuario, req.projetoId, true);
  (req.quadros || []).forEach((q) => {
    const id = idSeguro(q.id);
    const tipo = /^image\/(jpeg|png|webp)$/.test(q.tipo) ? q.tipo : 'image/jpeg';
    const ext = tipo.split('/')[1].replace('jpeg', 'jpg');
    pasta.createFile(Utilities.newBlob(Utilities.base64Decode(String(q.dados || '')), tipo, id + '.' + ext));
  });
  return { ok: true };
}

function salvarProjeto(req) {
  const usuario = usuarioDoToken(req.token);
  const p = req.projeto || {};
  const pasta = pastaDoProjeto(usuario, p.id, true);
  const frames = (p.frames || []).map(idSeguro);
  const meta = {
    id: idSeguro(p.id),
    title: limpar(p.title) || 'Sem nome',
    fps: Math.min(24, Math.max(1, Number(p.fps) || 8)),
    width: Number(p.width) || 0,
    height: Number(p.height) || 0,
    frames: frames,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
    sentAt: Number(p.sentAt) || 0,
  };
  const it = pasta.getFilesByName('projeto.json');
  if (it.hasNext()) it.next().setContent(JSON.stringify(meta));
  else pasta.createFile('projeto.json', JSON.stringify(meta), 'application/json');
  // Joga na lixeira os quadros que o aluno apagou.
  const usados = {};
  frames.forEach((id) => { usados[id] = true; });
  const tem = nomesDosQuadros(pasta);
  Object.keys(tem).forEach((id) => { if (!usados[id]) tem[id].setTrashed(true); });
  return { ok: true };
}

function baixarQuadros(req) {
  const usuario = usuarioDoToken(req.token);
  const pasta = pastaDoProjeto(usuario, req.projetoId, false);
  if (!pasta) throw new Error('Projeto não encontrado na nuvem.');
  const tem = nomesDosQuadros(pasta);
  const quadros = (req.ids || []).map(idSeguro).filter((id) => tem[id]).map((id) => {
    const b = tem[id].getBlob();
    return { id: id, tipo: b.getContentType(), dados: Utilities.base64Encode(b.getBytes()) };
  });
  return { ok: true, quadros: quadros };
}

function apagarProjeto(req) {
  const usuario = usuarioDoToken(req.token);
  const pasta = pastaDoProjeto(usuario, req.projetoId, false);
  if (pasta) pasta.setTrashed(true);
  return { ok: true };
}
