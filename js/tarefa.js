/* Tarefa do ProfSis (SisProf).
 *
 * O professor cria no ProfSis um link de entrega para uma atividade:
 *   https://<este site>/?tarefa=CODIGO
 * Aberto por esse link, o site:
 *   1. lê a tarefa no Firestore do ProfSis (entregas_tarefas/CODIGO): título, turma,
 *      prazo, se ainda recebe entregas e o Apps Script do professor (destinoUrl);
 *   2. mostra uma faixa com a tarefa e liga o "Enviar ao professor" para esse destino,
 *      com o vídeo indo para a subpasta Turma/Tarefa no Drive (window.SMR.setEntrega);
 *   3. quando o envio termina (evento smr:entregue), registra a entrega em
 *      entregas_tarefas/CODIGO/entregas, onde o professor vê e dá a nota no ProfSis.
 * Sem ?tarefa= este arquivo não faz nada (nem carrega o Firebase).
 */
(function () {
  'use strict';

  const codigo = (new URLSearchParams(location.search).get('tarefa') || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(codigo)) return;

  // Mesmo projeto do ProfSis. A chave web do Firebase é pública por desenho:
  // quem protege os dados são as Regras do Firestore do ProfSis.
  const FIREBASE = {
    apiKey: 'AIzaSyCOP_TE6YvVkg9E2DFuwfF7jDkBgxyc8ls',
    authDomain: 'profsis3.firebaseapp.com',
    projectId: 'profsis3',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/9.22.0/';

  let db = null;
  let tarefa = null;

  // ---------- faixa da tarefa ----------
  const faixa = document.createElement('div');
  faixa.className = 'task-banner';
  faixa.setAttribute('role', 'status');
  faixa.innerHTML = '<span class="task-icon" aria-hidden="true">📋</span><div class="task-text"><strong id="taskTitle">Carregando a tarefa…</strong><span id="taskInfo" class="small"></span></div>';
  const topo = document.querySelector('.topbar');
  if (topo && topo.parentNode) topo.parentNode.insertBefore(faixa, topo.nextSibling);
  else document.body.insertBefore(faixa, document.body.firstChild);
  const $t = (id) => document.getElementById(id);

  function mostrar(titulo, info, tipo) {
    $t('taskTitle').textContent = titulo;
    $t('taskInfo').textContent = info || '';
    faixa.dataset.tipo = tipo || '';
  }

  function dataBr(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function carregarScript(src) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falha(new Error('não carregou ' + src));
      document.head.appendChild(s);
    });
  }

  function esperarSMR() {
    return new Promise((ok) => {
      const tenta = () => (window.SMR ? ok(window.SMR) : setTimeout(tenta, 50));
      tenta();
    });
  }

  async function iniciar() {
    try {
      if (!window.firebase) {
        await carregarScript(SDK + 'firebase-app-compat.js');
        await carregarScript(SDK + 'firebase-firestore-compat.js');
      }
      const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE);
      db = app.firestore();
      const snap = await db.collection('entregas_tarefas').doc(codigo).get();
      if (!snap.exists) {
        mostrar('Link de tarefa não encontrado', 'Confira o link com o professor. Você pode fazer a animação e baixar o vídeo normalmente.', 'erro');
        return;
      }
      tarefa = snap.data() || {};
    } catch (err) {
      console.warn('[Tarefa]', err);
      mostrar('Não consegui abrir a tarefa', 'Verifique a internet e recarregue a página. Você pode fazer a animação e baixar o vídeo normalmente.', 'erro');
      return;
    }

    const titulo = String(tarefa.titulo || 'Tarefa');
    const partes = [];
    if (tarefa.turma) partes.push('Turma ' + tarefa.turma);
    if (tarefa.disciplina) partes.push(tarefa.disciplina);
    const prazo = dataBr(tarefa.prazo);
    const venceu = !!tarefa.prazo && tarefa.prazo < new Date().toLocaleDateString('sv-SE');
    if (prazo) partes.push((venceu ? 'Prazo terminou em ' : 'Entregar até ') + prazo);

    // Turma da tarefa como sugestão na tela de identificação.
    const inClass = document.getElementById('inClass');
    if (inClass && !inClass.value && tarefa.turma) inClass.value = String(tarefa.turma).slice(0, 30);

    const smr = await esperarSMR();
    const destino = String(tarefa.destinoUrl || '').trim() || String((window.SMR_CONFIG || {}).entregaUrl || '').trim();
    if (tarefa.aberta === false) {
      smr.setEntrega({ url: '', tarefa: '' });
      mostrar(titulo, partes.concat('O professor encerrou as entregas desta tarefa.').join(' · '), 'fechada');
      return;
    }
    if (!destino) {
      mostrar(titulo, partes.concat('O envio ainda não está configurado: baixe o vídeo e entregue ao professor.').join(' · '), 'aviso');
      return;
    }
    smr.setEntrega({ url: destino, tarefa: titulo });
    mostrar(titulo, partes.concat('Quando terminar, toque em “📤 Enviar ao professor”.').join(' · '), venceu ? 'aviso' : '');
  }

  // ---------- registrar a entrega ----------
  async function registrar(d) {
    const p = (window.__smr && window.__smr.state && window.__smr.state.project) || null;
    const corta = (s, n) => String(s || '').trim().slice(0, n);
    const doc = {
      nome: corta(d.aluno, 60),
      turma: corta(d.turma, 40),
      projeto: corta(d.projeto, 80),
      em: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (/^https:\/\/(drive|docs)\.google\.com\//.test(d.arquivoUrl || '')) doc.arquivoUrl = corta(d.arquivoUrl, 500);
    if (d.arquivoId) doc.arquivoId = corta(d.arquivoId, 200);
    if (p && p.frames) {
      doc.quadros = Math.min(5000, p.frames.length);
      if (p.fps) doc.segundos = Math.min(3600, Math.round((p.frames.length / p.fps) * 10) / 10);
    }
    let ultimo;
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500 * i));
      try {
        await db.collection('entregas_tarefas').doc(codigo).collection('entregas').add(doc);
        return;
      } catch (err) { ultimo = err; if (err && err.code === 'permission-denied') break; }
    }
    throw ultimo;
  }

  window.addEventListener('smr:entregue', async (ev) => {
    if (!db || !tarefa) return;
    const d = ev.detail || {};
    if (d.tarefa && d.tarefa !== String(tarefa.titulo || 'Tarefa')) return;
    try {
      await registrar(d);
      mostrar(String(tarefa.titulo || 'Tarefa'), '✅ Entrega registrada. O professor já pode ver o seu vídeo.', 'ok');
    } catch (err) {
      console.warn('[Tarefa] registro', err);
      mostrar(String(tarefa.titulo || 'Tarefa'), 'O vídeo chegou ao Drive do professor, mas não consegui marcar a entrega na tarefa. Avise o professor.', 'aviso');
    }
  });

  iniciar();
})();
