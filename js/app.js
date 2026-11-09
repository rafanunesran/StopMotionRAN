/* StopMotion RAN — aplicativo 100% no navegador. */
(function () {
  'use strict';

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const MAX_W = 1280;
  const LS_CURRENT = 'smr.currentStudent';
  const LS_STUDENTS = 'smr.students';
  const LS_PREFS = 'smr.prefs';

  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* armazenamento indisponível */ }
  }
  function norm(s) { return s.trim().replace(/\s+/g, ' '); }
  function ownerKey(st) { return (norm(st.name) + '|' + norm(st.cls)).toLowerCase(); }
  // Nome de arquivo sem acentos/símbolos (alguns navegadores rejeitam).
  function safeName(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/º/g, 'o').replace(/ª/g, 'a')
      .replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim() || 'stopmotion';
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
      img.src = src;
    });
  }
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // Desenha "src" (sw x sh) cobrindo todo o destino (corta as sobras), opcionalmente espelhado.
  function drawCover(ctx, src, sw, sh, dw, dh, mirror) {
    const scale = Math.max(dw / sw, dh / sh);
    const cropW = dw / scale, cropH = dh / scale;
    const sx = (sw - cropW) / 2, sy = (sh - cropH) / 2;
    ctx.save();
    if (mirror) { ctx.translate(dw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, sx, sy, cropW, cropH, 0, 0, dw, dh);
    ctx.restore();
  }
  // Desenha "src" inteiro dentro do destino, com faixas pretas se preciso.
  function drawContain(ctx, src, sw, sh, dw, dh) {
    const scale = Math.min(dw / sw, dh / sh);
    const w = sw * scale, h = sh * scale;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(src, (dw - w) / 2, (dh - h) / 2, w, h);
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, actionLabel, action, ms) {
    const t = $('toast');
    $('toastMsg').textContent = msg;
    const btn = $('toastAction');
    if (actionLabel) {
      btn.textContent = actionLabel;
      btn.hidden = false;
      btn.onclick = () => { hideToast(); action(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms || (actionLabel ? 6000 : 3000));
  }
  function hideToast() { $('toast').hidden = true; }

  // ---------- estado ----------
  const state = {
    student: null,
    project: null,
    cache: new Map(), // frameId -> { blob, url, img }
    selected: -1,
    stream: null,
    deviceId: lsGet(LS_PREFS, {}).deviceId || '',
    playing: false,
    playTimer: null,
    capturing: false,
    lastDeleted: null,
    exporting: false,
    busyBtn: null,
    saveTimer: null,
    dragFrom: -1,
  };

  // ---------- telas ----------
  function showScreen(name) {
    ['screenLogin', 'screenProjects', 'screenEditor'].forEach((id) => { $(id).hidden = id !== name; });
    window.scrollTo(0, 0);
  }

  function setStudent(st) {
    state.student = st;
    if (st) {
      lsSet(LS_CURRENT, st);
      const list = lsGet(LS_STUDENTS, []).filter((s) => ownerKey(s) !== ownerKey(st));
      list.unshift(st);
      lsSet(LS_STUDENTS, list.slice(0, 30));
      $('whoName').textContent = st.name;
      $('whoClass').textContent = st.cls;
      $('whoBox').hidden = false;
    } else {
      try { localStorage.removeItem(LS_CURRENT); } catch (e) { /* ok */ }
      $('whoBox').hidden = true;
    }
  }

  // ---------- login ----------
  function renderLogin() {
    const students = lsGet(LS_STUDENTS, []);
    const classes = [...new Set(students.map((s) => s.cls))];
    $('classList').innerHTML = '';
    classes.forEach((c) => { const o = document.createElement('option'); o.value = c; $('classList').appendChild(o); });
    const box = $('recentList');
    box.innerHTML = '';
    students.slice(0, 12).forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = s.name + ' · ' + s.cls;
      b.onclick = () => { setStudent(s); goProjects(); };
      box.appendChild(b);
    });
    $('recentStudents').hidden = students.length === 0;
    showScreen('screenLogin');
    $('inName').focus();
  }

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = norm($('inName').value);
    const cls = norm($('inClass').value);
    const school = norm($('inSchool').value);
    if (!name || !cls) return;
    setStudent({ name, cls, school });
    $('loginForm').reset();
    goProjects();
  });

  $('btnLogout').addEventListener('click', async () => {
    await leaveEditor();
    setStudent(null);
    renderLogin();
  });

  // ---------- projetos ----------
  async function goProjects() {
    await leaveEditor();
    showScreen('screenProjects');
    const grid = $('projectGrid');
    grid.innerHTML = '';
    let projects = [];
    try {
      projects = await DB.listProjects(ownerKey(state.student));
    } catch (err) {
      toast('Não foi possível abrir o armazenamento do navegador. Verifique se não está em janela anônima.');
    }
    $('emptyProjects').hidden = projects.length > 0;
    for (const p of projects) {
      const card = document.createElement('article');
      card.className = 'project-card';
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (p.frames.length) {
        DB.getFrame(p.frames[0]).then((f) => {
          if (!f) return;
          const img = document.createElement('img');
          img.alt = '';
          img.src = URL.createObjectURL(f.blob);
          img.onload = () => URL.revokeObjectURL(img.src);
          thumb.appendChild(img);
        });
      } else {
        thumb.textContent = '🎞️';
      }
      const info = document.createElement('div');
      info.className = 'info';
      const h = document.createElement('h3');
      h.textContent = p.title;
      const meta = document.createElement('p');
      meta.className = 'muted small';
      meta.textContent = p.frames.length + ' quadro(s) · ' + p.fps + ' qps · ' + fmtDate(p.updatedAt);
      info.append(h, meta);
      const actions = document.createElement('div');
      actions.className = 'btn-row';
      const open = document.createElement('button');
      open.className = 'btn primary small';
      open.type = 'button';
      open.textContent = 'Abrir';
      open.onclick = () => openProject(p.id);
      const del = document.createElement('button');
      del.className = 'btn danger small';
      del.type = 'button';
      del.textContent = 'Apagar';
      del.onclick = async () => {
        if (!confirm('Apagar o projeto "' + p.title + '"? Isso não pode ser desfeito.')) return;
        await DB.deleteProject(p.id);
        toast('Projeto apagado.');
        goProjects();
      };
      actions.append(open, del);
      thumb.onclick = () => openProject(p.id);
      card.append(thumb, info, actions);
      grid.appendChild(card);
    }
  }

  $('btnNewProject').addEventListener('click', async () => {
    const existing = await DB.listProjects(ownerKey(state.student)).catch(() => []);
    const now = Date.now();
    const p = {
      id: uid(),
      owner: ownerKey(state.student),
      ownerName: state.student.name,
      ownerClass: state.student.cls,
      ownerSchool: state.student.school || '',
      title: 'Minha animação ' + (existing.length + 1),
      fps: 8,
      frames: [],
      width: 0,
      height: 0,
      createdAt: now,
      updatedAt: now,
    };
    await DB.putProject(p);
    openProject(p.id);
  });

  // ---------- importar / exportar arquivo do projeto ----------
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  $('btnExportProject').addEventListener('click', async () => {
    const p = state.project;
    if (!p) return;
    toast('Preparando arquivo…');
    const frames = [];
    for (const id of p.frames) frames.push(await blobToDataURL(state.cache.get(id).blob));
    const data = {
      format: 'stopmotion-ran',
      version: 1,
      title: p.title,
      fps: p.fps,
      width: p.width,
      height: p.height,
      student: { name: p.ownerName, cls: p.ownerClass, school: p.ownerSchool || '' },
      exportedAt: new Date().toISOString(),
      frames,
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    download(blob, safeName(p.title + ' - ' + p.ownerName) + '.stopmotion.json');
    toast('Arquivo do projeto baixado.');
  });

  $('inImportProject').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'stopmotion-ran' || !Array.isArray(data.frames)) throw new Error('formato');
      const now = Date.now();
      const p = {
        id: uid(),
        owner: ownerKey(state.student),
        ownerName: state.student.name,
        ownerClass: state.student.cls,
        ownerSchool: state.student.school || '',
        title: String(data.title || 'Projeto importado').slice(0, 80),
        fps: Math.min(24, Math.max(1, parseInt(data.fps, 10) || 8)),
        frames: [],
        width: data.width || 0,
        height: data.height || 0,
        createdAt: now,
        updatedAt: now,
      };
      for (const url of data.frames) {
        const blob = await (await fetch(url)).blob();
        const id = uid();
        await DB.putFrame({ id, projectId: p.id, blob });
        p.frames.push(id);
      }
      await DB.putProject(p);
      toast('Projeto importado com ' + p.frames.length + ' quadro(s).');
      goProjects();
    } catch (err) {
      toast('Este arquivo não é um projeto válido do StopMotion RAN.');
    }
  });

  // ---------- editor ----------
  async function openProject(id) {
    const p = await DB.getProject(id);
    if (!p) { toast('Projeto não encontrado.'); return; }
    state.project = p;
    clearCache();
    $('saveState').textContent = 'Carregando…';
    showScreen('screenEditor');
    $('inTitle').value = p.title;
    $('rngFps').value = p.fps;
    const valid = [];
    for (const fid of p.frames) {
      const f = await DB.getFrame(fid);
      if (!f) continue;
      await addToCache(fid, f.blob);
      valid.push(fid);
    }
    p.frames = valid;
    state.selected = p.frames.length - 1;
    $('saveState').textContent = '';
    showSentInfo();
    updateFpsLabels();
    applyStageAspect();
    renderTimeline();
    setMode('live');
    await startCamera();
  }

  async function leaveEditor() {
    stopPlay();
    stopCamera();
    if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; await saveProject(); }
    state.project = null;
    clearCache();
  }

  $('btnBack').addEventListener('click', goProjects);

  async function addToCache(id, blob) {
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    state.cache.set(id, { blob, url, img });
  }
  function clearCache() {
    state.cache.forEach((c) => URL.revokeObjectURL(c.url));
    state.cache.clear();
  }

  function scheduleSave() {
    if (!state.project) return;
    $('saveState').textContent = 'Salvando…';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => { state.saveTimer = null; saveProject(); }, 400);
  }
  async function saveProject() {
    const p = state.project;
    if (!p) return;
    p.updatedAt = Date.now();
    try {
      await DB.putProject(p);
      if (state.project === p) $('saveState').textContent = 'Salvo ✓';
    } catch (err) {
      $('saveState').textContent = 'Erro ao salvar!';
      toast('Não foi possível salvar. O armazenamento do navegador pode estar cheio.');
    }
  }

  $('inTitle').addEventListener('input', () => {
    if (!state.project) return;
    state.project.title = $('inTitle').value.trim() || 'Sem nome';
    scheduleSave();
  });

  // ---------- câmera ----------
  async function startCamera() {
    stopCamera();
    const msg = $('stageMsg');
    msg.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStageMsg('Este navegador não permite usar a câmera aqui. Abra o site por um endereço https:// (como o da Vercel) ou use “Adicionar imagens”.');
      return;
    }
    const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (state.deviceId) video.deviceId = { exact: state.deviceId };
    else video.facingMode = 'environment';
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      if (state.deviceId) {
        state.deviceId = '';
        return startCamera();
      }
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      showStageMsg(denied
        ? 'A câmera foi bloqueada. Clique no cadeado ao lado do endereço do site, permita a câmera e recarregue a página.'
        : 'Nenhuma câmera encontrada. Conecte uma câmera ou use “Adicionar imagens”.');
      return;
    }
    if (!state.project) { stopCamera(); return; }
    const v = $('video');
    v.srcObject = state.stream;
    await new Promise((r) => { if (v.readyState >= 1) r(); else v.onloadedmetadata = () => r(); });
    try { await v.play(); } catch (e) { /* autoplay */ }
    const track = state.stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    if (settings.deviceId) state.deviceId = settings.deviceId;
    if (settings.facingMode === 'user' && lsGet(LS_PREFS, {}).mirror === undefined) $('chkMirror').checked = true;
    applyMirror();
    applyStageAspect();
    await listCameras();
    drawOnion();
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    $('video').srcObject = null;
  }

  function showStageMsg(text) {
    const m = $('stageMsg');
    m.textContent = text;
    m.hidden = false;
  }

  async function listCameras() {
    const sel = $('selCamera');
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { /* ok */ }
    sel.innerHTML = '';
    devices.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || ('Câmera ' + (i + 1));
      if (d.deviceId === state.deviceId) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = devices.length < 2;
  }

  $('selCamera').addEventListener('change', () => {
    state.deviceId = $('selCamera').value;
    savePrefs();
    startCamera();
  });

  function applyMirror() {
    $('video').classList.toggle('mirror', $('chkMirror').checked);
  }

  // A proporção do palco é a do projeto (definida na 1ª foto) ou a da câmera.
  function applyStageAspect() {
    const p = state.project;
    const v = $('video');
    let w = 16, h = 9;
    if (p && p.width && p.height) { w = p.width; h = p.height; }
    else if (v.videoWidth) { w = v.videoWidth; h = v.videoHeight; }
    $('stage').style.aspectRatio = w + ' / ' + h;
  }

  function projectSize() {
    const p = state.project;
    if (p.width && p.height) return [p.width, p.height];
    const v = $('video');
    let w = v.videoWidth || 1280, h = v.videoHeight || 720;
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
    p.width = w; p.height = h;
    return [w, h];
  }

  // ---------- papel de cebola ----------
  function drawOnion() {
    const c = $('onionCanvas');
    const p = state.project;
    if (!p) return;
    const [w, h] = p.width ? [p.width, p.height] : [640, 360];
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const live = !state.playing && !!state.stream;
    // Sem câmera: mostra o quadro selecionado por inteiro.
    if (!state.stream && !state.playing && state.selected >= 0) {
      ctx.globalAlpha = 1;
      const f = state.cache.get(p.frames[state.selected]);
      if (f) drawContain(ctx, f.img, f.img.naturalWidth, f.img.naturalHeight, w, h);
      return;
    }
    if (!live || !$('chkOnion').checked || state.selected < 0) return;
    const n = parseInt($('selOnionCount').value, 10);
    const base = parseInt($('rngOnion').value, 10) / 100;
    for (let k = n - 1; k >= 0; k--) {
      const idx = state.selected - k;
      if (idx < 0) continue;
      const f = state.cache.get(p.frames[idx]);
      if (!f) continue;
      ctx.globalAlpha = base * Math.pow(0.55, k);
      ctx.drawImage(f.img, 0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  ['chkOnion', 'rngOnion', 'selOnionCount'].forEach((id) => $(id).addEventListener('input', () => { drawOnion(); savePrefs(); }));
  $('chkMirror').addEventListener('change', () => { applyMirror(); savePrefs(); });
  $('chkGrid').addEventListener('change', () => { $('gridOverlay').hidden = !$('chkGrid').checked; savePrefs(); });
  $('selTimer').addEventListener('change', savePrefs);
  $('chkLoop').addEventListener('change', savePrefs);

  function savePrefs() {
    lsSet(LS_PREFS, {
      deviceId: state.deviceId,
      mirror: $('chkMirror').checked,
      grid: $('chkGrid').checked,
      onion: $('chkOnion').checked,
      onionOpacity: $('rngOnion').value,
      onionCount: $('selOnionCount').value,
      timer: $('selTimer').value,
      loop: $('chkLoop').checked,
    });
  }
  function loadPrefs() {
    const p = lsGet(LS_PREFS, {});
    if (p.mirror !== undefined) $('chkMirror').checked = p.mirror;
    if (p.grid !== undefined) $('chkGrid').checked = p.grid;
    if (p.onion !== undefined) $('chkOnion').checked = p.onion;
    if (p.onionOpacity) $('rngOnion').value = p.onionOpacity;
    if (p.onionCount) $('selOnionCount').value = p.onionCount;
    if (p.timer) $('selTimer').value = p.timer;
    if (p.loop !== undefined) $('chkLoop').checked = p.loop;
    $('gridOverlay').hidden = !$('chkGrid').checked;
  }

  // ---------- captura ----------
  async function capture() {
    if (!state.project || state.capturing || state.exporting) return;
    if (state.playing) { stopPlay(); return; }
    const v = $('video');
    if (!state.stream || !v.videoWidth) {
      toast('A câmera não está ligada. Use “Adicionar imagens” ou permita a câmera.');
      return;
    }
    state.capturing = true;
    $('btnCapture').disabled = true;
    try {
      const secs = parseInt($('selTimer').value, 10);
      if (secs > 0) await countdown(secs);
      if (!state.project || !state.stream) return;
      const [w, h] = projectSize();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      drawCover(c.getContext('2d'), v, v.videoWidth, v.videoHeight, w, h, $('chkMirror').checked);
      const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
      flash();
      await insertFrame(blob, state.selected + 1);
      applyStageAspect();
    } finally {
      state.capturing = false;
      $('btnCapture').disabled = false;
    }
  }

  function countdown(secs) {
    return new Promise((resolve) => {
      const el = $('countdown');
      let n = secs;
      el.textContent = n;
      el.hidden = false;
      const t = setInterval(() => {
        n -= 1;
        if (n <= 0) { clearInterval(t); el.hidden = true; resolve(); }
        else el.textContent = n;
      }, 1000);
    });
  }

  function flash() {
    const f = $('flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  async function insertFrame(blob, index) {
    const p = state.project;
    const id = uid();
    await DB.putFrame({ id, projectId: p.id, blob });
    await addToCache(id, blob);
    p.frames.splice(index, 0, id);
    state.selected = index;
    renderTimeline();
    drawOnion();
    scheduleSave();
    return id;
  }

  $('btnCapture').addEventListener('click', capture);

  $('inAddImages').addEventListener('change', async (e) => {
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    e.target.value = '';
    if (!files.length || !state.project) return;
    stopPlay();
    let count = 0;
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const p = state.project;
        if (!p.width) {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
          p.width = w; p.height = h;
        }
        const c = document.createElement('canvas');
        c.width = p.width; c.height = p.height;
        drawContain(c.getContext('2d'), img, img.naturalWidth, img.naturalHeight, p.width, p.height);
        const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
        await insertFrame(blob, state.selected + 1);
        count++;
      } catch (err) { /* ignora arquivo inválido */ }
      URL.revokeObjectURL(url);
    }
    applyStageAspect();
    toast(count + ' imagem(ns) adicionada(s).');
  });

  // ---------- linha do tempo ----------
  function renderTimeline() {
    const p = state.project;
    const tl = $('timeline');
    tl.innerHTML = '';
    p.frames.forEach((id, i) => {
      const c = state.cache.get(id);
      const li = document.createElement('li');
      li.className = 'frame' + (i === state.selected ? ' selected' : '');
      li.draggable = true;
      li.dataset.index = i;
      li.tabIndex = 0;
      li.setAttribute('aria-label', 'Quadro ' + (i + 1));
      const img = document.createElement('img');
      img.src = c.url;
      img.alt = '';
      img.draggable = false;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'frame-del';
      del.title = 'Apagar quadro';
      del.textContent = '×';
      del.onclick = (ev) => { ev.stopPropagation(); deleteFrame(i); };
      li.append(img, num, del);
      li.onclick = () => select(i);
      li.addEventListener('dragstart', (ev) => {
        state.dragFrom = i;
        li.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e2) { /* ok */ }
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        tl.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      });
      li.addEventListener('dragover', (ev) => {
        if (state.dragFrom < 0) return;
        ev.preventDefault();
        const r = li.getBoundingClientRect();
        const after = ev.clientX > r.left + r.width / 2;
        li.classList.toggle('drop-after', after);
        li.classList.toggle('drop-before', !after);
      });
      li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
      li.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const from = state.dragFrom;
        state.dragFrom = -1;
        if (from < 0) return;
        const r = li.getBoundingClientRect();
        let to = i + (ev.clientX > r.left + r.width / 2 ? 1 : 0);
        if (from < to) to -= 1;
        moveFrame(from, to);
      });
      tl.appendChild(li);
    });
    $('frameCount').textContent = '(' + p.frames.length + ')';
    updateSelInfo();
    updateFpsLabels();
    scrollToFrame(tl.children[state.selected]);
  }

  // Rola só a faixa de quadros (sem mexer na página).
  function scrollToFrame(el) {
    if (!el) return;
    const tl = $('timeline');
    const left = el.offsetLeft;
    if (left < tl.scrollLeft) tl.scrollLeft = left - 8;
    else if (left + el.offsetWidth > tl.scrollLeft + tl.clientWidth) tl.scrollLeft = left + el.offsetWidth - tl.clientWidth + 8;
  }

  function select(i) {
    const p = state.project;
    if (!p || !p.frames.length) return;
    stopPlay();
    state.selected = Math.max(0, Math.min(p.frames.length - 1, i));
    const tl = $('timeline');
    [...tl.children].forEach((li, k) => li.classList.toggle('selected', k === state.selected));
    scrollToFrame(tl.children[state.selected]);
    updateSelInfo();
    drawOnion();
  }

  function updateSelInfo() {
    const p = state.project;
    const has = p.frames.length > 0 && state.selected >= 0;
    $('selInfo').textContent = has ? 'Quadro ' + (state.selected + 1) + ' de ' + p.frames.length : 'Nenhum quadro ainda. Tire a primeira foto!';
    $('btnLeft').disabled = !has || state.selected === 0;
    $('btnRight').disabled = !has || state.selected === p.frames.length - 1;
    $('btnDup').disabled = !has;
    $('btnDel').disabled = !has;
    $('btnPlay').disabled = p.frames.length === 0;
    $('btnExport').disabled = p.frames.length === 0 || state.exporting;
    $('btnSend').disabled = p.frames.length === 0 || state.exporting;
    $('btnExportProject').disabled = p.frames.length === 0;
  }

  function moveFrame(from, to) {
    const p = state.project;
    if (from === to || to < 0 || to >= p.frames.length) return;
    const [id] = p.frames.splice(from, 1);
    p.frames.splice(to, 0, id);
    state.selected = to;
    renderTimeline();
    drawOnion();
    scheduleSave();
  }

  async function deleteFrame(i) {
    const p = state.project;
    if (i < 0 || i >= p.frames.length) return;
    stopPlay();
    const id = p.frames[i];
    const c = state.cache.get(id);
    p.frames.splice(i, 1);
    state.lastDeleted = { blob: c.blob, index: i, projectId: p.id };
    URL.revokeObjectURL(c.url);
    state.cache.delete(id);
    await DB.deleteFrame(id);
    state.selected = Math.min(i, p.frames.length - 1);
    if (state.selected < 0 && p.frames.length) state.selected = 0;
    if (!p.frames.length) { p.width = 0; p.height = 0; applyStageAspect(); }
    renderTimeline();
    drawOnion();
    scheduleSave();
    toast('Quadro ' + (i + 1) + ' apagado.', 'Desfazer', undoDelete);
  }

  async function undoDelete() {
    const d = state.lastDeleted;
    if (!d || !state.project || d.projectId !== state.project.id) return;
    state.lastDeleted = null;
    if (!state.project.width) {
      const img = await loadImage(URL.createObjectURL(d.blob));
      state.project.width = img.naturalWidth; state.project.height = img.naturalHeight;
      URL.revokeObjectURL(img.src);
      applyStageAspect();
    }
    await insertFrame(d.blob, Math.min(d.index, state.project.frames.length));
    toast('Quadro restaurado.');
  }

  async function duplicateFrame() {
    const p = state.project;
    if (state.selected < 0) return;
    stopPlay();
    const c = state.cache.get(p.frames[state.selected]);
    await insertFrame(c.blob, state.selected + 1);
  }

  $('btnLeft').addEventListener('click', () => moveFrame(state.selected, state.selected - 1));
  $('btnRight').addEventListener('click', () => moveFrame(state.selected, state.selected + 1));
  $('btnDup').addEventListener('click', duplicateFrame);
  $('btnDel').addEventListener('click', () => deleteFrame(state.selected));

  // ---------- velocidade ----------
  function updateFpsLabels() {
    const p = state.project;
    if (!p) return;
    $('fpsLabel').textContent = p.fps;
    const secs = p.frames.length / p.fps;
    $('durationLabel').textContent = 'Duração: ' + secs.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s (' + p.frames.length + ' quadros)';
  }
  $('rngFps').addEventListener('input', () => {
    if (!state.project) return;
    state.project.fps = parseInt($('rngFps').value, 10);
    updateFpsLabels();
    if (state.playing) { stopPlay(); play(); }
    scheduleSave();
  });

  // ---------- prévia ----------
  function setMode(mode) {
    const playing = mode === 'play';
    $('viewCanvas').hidden = !playing;
    $('video').style.visibility = playing ? 'hidden' : 'visible';
    $('modeTag').textContent = playing ? 'Prévia' : 'Câmera';
    $('modeTag').classList.toggle('play', playing);
    $('btnPlay').textContent = playing ? '■ Parar' : '▶ Prévia';
    $('btnCapture').classList.toggle('dim', playing);
  }

  function play() {
    const p = state.project;
    if (!p || !p.frames.length) return;
    state.playing = true;
    setMode('play');
    drawOnion();
    const c = $('viewCanvas');
    c.width = p.width; c.height = p.height;
    const ctx = c.getContext('2d');
    let i = 0;
    const tl = $('timeline');
    const step = () => {
      if (!state.playing) return;
      if (i >= p.frames.length) {
        if ($('chkLoop').checked) i = 0;
        else { stopPlay(); return; }
      }
      const f = state.cache.get(p.frames[i]);
      if (f) ctx.drawImage(f.img, 0, 0, c.width, c.height);
      [...tl.children].forEach((li, k) => li.classList.toggle('playing', k === i));
      i++;
      state.playTimer = setTimeout(step, 1000 / p.fps);
    };
    step();
  }

  function stopPlay() {
    if (!state.playing) return;
    state.playing = false;
    clearTimeout(state.playTimer);
    [...$('timeline').children].forEach((li) => li.classList.remove('playing'));
    setMode('live');
    drawOnion();
  }

  $('btnPlay').addEventListener('click', () => (state.playing ? stopPlay() : play()));
  $('btnLive').addEventListener('click', () => {
    stopPlay();
    if (!state.stream) startCamera();
  });

  // ---------- exportar vídeo ----------
  window.SMR_CONFIG = window.SMR_CONFIG || {};
  // Lido na hora do envio: outro script (ex.: js/tarefa.js) pode trocar o destino depois.
  const entregaUrl = () => String(window.SMR_CONFIG.entregaUrl || '').trim();
  const CHUNK = 4 * 1024 * 1024; // múltiplo de 256 KB, exigência do Google Drive

  function pickMime() {
    if (!window.MediaRecorder) return null;
    const types = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    return types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  }

  function videoFileName(p, ext) {
    return safeName(p.title + ' - ' + p.ownerName + ' ' + p.ownerClass) + '.' + ext;
  }

  // Liga/desliga os botões e a barra de progresso enquanto gera ou envia.
  function setBusy(busy, label) {
    const p = state.project;
    state.exporting = busy;
    const none = !p || !p.frames.length;
    $('btnExport').disabled = busy || none;
    $('btnSend').disabled = busy || none;
    $('btnExport').textContent = '⬇ Baixar vídeo';
    $('btnSend').textContent = '📤 Enviar ao professor';
    if (busy && label) state.busyBtn.textContent = label;
    if (busy) { $('exportProgress').hidden = false; $('exportBar').style.width = '0%'; }
    else setTimeout(() => { if (!state.exporting) $('exportProgress').hidden = true; }, 800);
  }
  function setProgress(frac) { $('exportBar').style.width = Math.round(frac * 100) + '%'; }

  // Grava os quadros num vídeo e devolve { blob, ext }.
  async function renderVideo(p, mime) {
    const canvasEl = document.createElement('canvas');
    // Dimensões pares (exigência de alguns codificadores).
    const w = p.width - (p.width % 2), h = p.height - (p.height % 2);
    canvasEl.width = w; canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const stream = canvasEl.captureStream(30);
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
    } catch (err) {
      rec = new MediaRecorder(stream);
    }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });

    const frameMs = 1000 / p.fps;
    const total = p.frames.length;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      rec.start(250);
      const t0 = performance.now();
      for (let i = 0; i < total; i++) {
        const f = state.cache.get(p.frames[i]);
        ctx.drawImage(f.img, 0, 0, w, h);
        setProgress((i + 1) / total);
        // Mantém o tempo exato com base no relógio, redesenhando para gerar quadros no stream.
        const until = t0 + (i + 1) * frameMs;
        while (performance.now() < until) {
          await sleep(Math.min(40, Math.max(1, until - performance.now())));
          ctx.drawImage(f.img, 0, 0, w, h);
        }
      }
      await sleep(150);
      rec.stop();
      await stopped;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return { blob: new Blob(chunks, { type }), ext };
  }

  // Confere se o navegador grava vídeo; devolve o tipo ou null.
  function checkRecorder() {
    const mime = pickMime();
    if (mime === null || !document.createElement('canvas').captureStream) {
      toast('Este navegador não consegue gravar vídeo. Tente o Google Chrome, Edge ou Firefox.');
      return null;
    }
    return mime;
  }

  async function exportVideo() {
    const p = state.project;
    if (!p || !p.frames.length || state.exporting) return;
    const mime = checkRecorder();
    if (mime === null) return;
    stopPlay();
    state.busyBtn = $('btnExport');
    setBusy(true, 'Gerando vídeo…');
    try {
      const { blob, ext } = await renderVideo(p, mime);
      download(blob, videoFileName(p, ext));
      toast('Vídeo pronto! Verifique a pasta de downloads.');
    } catch (err) {
      toast('Não foi possível gerar o vídeo: ' + (err && err.message ? err.message : err));
    } finally {
      setBusy(false);
    }
  }
  $('btnExport').addEventListener('click', exportVideo);

  // ---------- enviar ao professor (Google Drive via Apps Script) ----------
  function blobToBase64(blob) {
    return blobToDataURL(blob).then((u) => u.slice(u.indexOf(',') + 1));
  }

  async function callEntrega(body) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        // text/plain evita a verificação prévia (CORS) que o Apps Script não responde.
        const res = await fetch(entregaUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.ok) { const e = new Error(data.erro || 'erro desconhecido'); e.final = true; throw e; }
        return data;
      } catch (err) {
        lastErr = err;
        if (err.final) break;
      }
    }
    throw lastErr;
  }

  function showSentInfo() {
    const p = state.project;
    const el = $('sentInfo');
    if (p && p.sentAt) {
      el.textContent = '✅ Enviado ao professor em ' + fmtDate(p.sentAt);
      el.hidden = false;
    } else el.hidden = true;
  }

  async function sendToTeacher() {
    const p = state.project;
    if (!entregaUrl() || !p || !p.frames.length || state.exporting) return;
    const again = p.sentAt ? '\n\nVocê já enviou este projeto em ' + fmtDate(p.sentAt) + '. Enviar de novo?' : '';
    if (!window.confirm('Enviar "' + p.title + '" para o professor?\n\nAluno: ' + p.ownerName + '\nTurma: ' + p.ownerClass + again)) return;
    const mime = checkRecorder();
    if (mime === null) return;
    stopPlay();
    state.busyBtn = $('btnSend');
    setBusy(true, 'Gerando vídeo…');
    let video = null;
    try {
      video = await renderVideo(p, mime);
      const { blob } = video;
      $('btnSend').textContent = 'Enviando… 0%';
      setProgress(0);
      const start = await callEntrega({
        acao: 'iniciar',
        aluno: p.ownerName, turma: p.ownerClass, escola: p.ownerSchool || '', titulo: p.title,
        quadros: p.frames.length, fps: p.fps,
        tarefa: String(window.SMR_CONFIG.tarefa || ''),
        tipo: blob.type, tamanho: blob.size,
      });
      let done = null;
      for (let off = 0; off < blob.size; off += CHUNK) {
        const part = blob.slice(off, Math.min(off + CHUNK, blob.size));
        const r = await callEntrega({
          acao: 'parte', sessao: start.sessao, inicio: off, total: blob.size,
          dados: await blobToBase64(part),
        });
        if (r.completo) done = r;
        const frac = Math.min(1, (off + part.size) / blob.size);
        setProgress(frac);
        $('btnSend').textContent = 'Enviando… ' + Math.round(frac * 100) + '%';
      }
      if (!done) throw new Error('o Google Drive não confirmou o recebimento');
      p.sentAt = Date.now();
      await saveProject();
      showSentInfo();
      // Aviso para outros scripts (ex.: registrar a entrega de uma tarefa).
      window.dispatchEvent(new CustomEvent('smr:entregue', { detail: {
        projeto: p.title, aluno: p.ownerName, turma: p.ownerClass,
        arquivoId: done.arquivoId || '', arquivoUrl: done.arquivoUrl || '', nome: done.nome || '',
        tarefa: String(window.SMR_CONFIG.tarefa || ''), em: p.sentAt,
      } }));
      toast('Trabalho entregue ao professor! ✅', null, null, 6000);
    } catch (err) {
      const why = String(err && err.message ? err.message : err).replace(/\.+$/, '');
      const msg = 'Não foi possível enviar: ' + why + '. Verifique a internet e tente de novo.';
      if (video) toast(msg, 'Baixar vídeo', () => download(video.blob, videoFileName(p, video.ext)), 12000);
      else toast(msg, null, null, 8000);
    } finally {
      setBusy(false);
    }
  }
  $('btnSend').addEventListener('click', sendToTeacher);
  function refreshSendButton() {
    const on = !!entregaUrl();
    $('btnSend').hidden = !on;
    $('btnExport').classList.toggle('primary', !on);
    $('btnExport').classList.toggle('ghost', on);
  }
  refreshSendButton();

  // ---------- teclado ----------
  document.addEventListener('keydown', (e) => {
    if ($('screenEditor').hidden || !state.project) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (e.key === 'Escape' || e.key === 'Enter') e.target.blur();
      if (!(tag === 'input' && ['checkbox', 'range'].includes(e.target.type))) return;
    }
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); capture(); }
    else if (e.key === 'p' || e.key === 'P') { state.playing ? stopPlay() : play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); select(state.selected - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); select(state.selected + 1); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteFrame(state.selected); }
    else if (e.key === 'd' || e.key === 'D') { duplicateFrame(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoDelete(); }
  });

  // Libera a câmera ao sair / esconder a aba; religa ao voltar.
  document.addEventListener('visibilitychange', () => {
    if ($('screenEditor').hidden || !state.project) return;
    if (document.hidden) { stopPlay(); stopCamera(); }
    else if (!state.stream) startCamera();
  });
  window.addEventListener('beforeunload', () => { if (state.saveTimer) saveProject(); });

  // ---------- início ----------
  loadPrefs();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const current = lsGet(LS_CURRENT, null);
  if (current && current.name && current.cls) { setStudent(current); goProjects(); }
  else renderLogin();

  // Para testes automatizados.
  window.__smr = { state };
  // API para outros scripts: trocar o destino da entrega e a tarefa (subpasta no Drive).
  window.SMR = {
    setEntrega(opts) {
      if (opts && 'url' in opts) window.SMR_CONFIG.entregaUrl = opts.url || '';
      if (opts && 'tarefa' in opts) window.SMR_CONFIG.tarefa = opts.tarefa || '';
      refreshSendButton();
    },
  };
})();
