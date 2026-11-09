/* Pequenos ajustes de interface, separados da lógica principal (app.js). */
(function () {
  'use strict';

  // Botões "atalho" que acionam outro botão (ex.: CTA do estado vazio → Novo projeto).
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-proxy-click]');
    if (!el) return;
    var target = document.getElementById(el.getAttribute('data-proxy-click'));
    if (target) target.click();
  });

  // No celular, o painel "Câmera e ajudas" começa fechado para a tela não ficar longa demais.
  var panel = document.getElementById('panelCamera');
  if (panel && window.matchMedia('(max-width: 600px)').matches) panel.open = false;

  // Mantém o quadro selecionado visível na película.
  var tl = document.getElementById('timeline');
  if (tl && 'MutationObserver' in window) {
    var last = null;
    new MutationObserver(function () {
      var sel = tl.querySelector('.frame.selected');
      if (!sel || sel === last) return;
      last = sel;
      // Rola só a película (na horizontal), sem mexer na página.
      var l = sel.offsetLeft, r = l + sel.offsetWidth;
      if (l < tl.scrollLeft) tl.scrollLeft = l - 8;
      else if (r > tl.scrollLeft + tl.clientWidth) tl.scrollLeft = r - tl.clientWidth + 8;
    }).observe(tl, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  }

  // Preenche a parte "ativa" dos controles deslizantes (Chrome/Safari não fazem isso sozinhos).
  function paintRange(r) {
    var min = +r.min || 0, max = +r.max || 100;
    r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
  }
  function paintAll() { document.querySelectorAll('input[type="range"]').forEach(paintRange); }
  document.addEventListener('input', function (e) {
    if (e.target.matches && e.target.matches('input[type="range"]')) paintRange(e.target);
  });
  paintAll();
  var fps = document.getElementById('fpsLabel');
  if (fps && 'MutationObserver' in window) new MutationObserver(paintAll).observe(fps, { childList: true, characterData: true, subtree: true });

  // ---------- Câmera em tela cheia ----------
  var stage = document.getElementById('stage');
  var fsBtn = document.getElementById('btnFullscreen');
  var video = document.getElementById('video');
  var editor = document.getElementById('screenEditor');
  var fsCount = document.getElementById('fsCount');
  var fsOn = false;

  function stageRatio() {
    var m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(stage.style.aspectRatio || '');
    if (m && +m[2]) return +m[1] / +m[2];
    if (video && video.videoWidth) return video.videoWidth / video.videoHeight;
    return 16 / 9;
  }
  function fitStage() {
    if (!fsOn) return;
    var vw = window.innerWidth, vh = window.innerHeight, r = stageRatio();
    var w = Math.min(vw, vh * r), h = w / r;
    stage.style.width = Math.floor(w) + 'px';
    stage.style.height = Math.floor(h) + 'px';
  }
  function updateCount() {
    var n = document.querySelectorAll('#timeline .frame').length;
    fsCount.textContent = n === 1 ? '1 quadro' : n + ' quadros';
  }
  function setFs(on) {
    if (on === fsOn) return;
    fsOn = on;
    document.body.classList.toggle('cam-fs', on);
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsBtn.title = on ? 'Sair da tela cheia (Esc)' : 'Tela cheia (F)';
    fsBtn.setAttribute('aria-label', on ? 'Sair da tela cheia' : 'Tela cheia');
    if (on) {
      updateCount(); fitStage();
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      // No iPhone não existe tela cheia de página: o modo "tela cheia" visual já cobre a tela.
      if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
        try { var pr = req.call(el, { navigationUI: 'hide' }); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
      }
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
    } else {
      stage.style.width = ''; stage.style.height = '';
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if ((document.fullscreenElement || document.webkitFullscreenElement) && ex) {
        try { var pe = ex.call(document); if (pe && pe.catch) pe.catch(function () {}); } catch (e) {}
      }
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    }
  }
  if (stage && fsBtn) {
    fsBtn.addEventListener('click', function () { setFs(!fsOn); fsBtn.blur(); });
    window.addEventListener('resize', fitStage);
    if (video) video.addEventListener('loadedmetadata', fitStage);
    // Saiu da tela cheia do navegador (Esc, gesto de voltar) → sai do modo também.
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) setFs(false);
        else fitStage();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (editor.hidden) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' && !/^(checkbox|range)$/.test(e.target.type)) return;
      if (tag === 'select' || tag === 'textarea') return;
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setFs(!fsOn); }
      else if (e.key === 'Escape' && fsOn) setFs(false);
    });
    // Sai da tela cheia ao fechar o editor.
    if ('MutationObserver' in window) {
      new MutationObserver(function () { if (editor.hidden) setFs(false); })
        .observe(editor, { attributes: true, attributeFilter: ['hidden'] });
      var lastAr = stage.style.aspectRatio;
      new MutationObserver(function () {
        if (stage.style.aspectRatio === lastAr) return;
        lastAr = stage.style.aspectRatio; fitStage();
      }).observe(stage, { attributes: true, attributeFilter: ['style'] });
      var tlEl = document.getElementById('timeline');
      if (tlEl) new MutationObserver(function () { if (fsOn) updateCount(); }).observe(tlEl, { childList: true });
    }
  }

  // ---------- QR code para compartilhar o site ----------
  var qrDialog = document.getElementById('qrDialog');
  function siteUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function openQr() {
    if (!qrDialog) return;
    var url = siteUrl();
    var box = document.getElementById('qrBox');
    box.innerHTML = '';
    if (typeof qrcode === 'function') {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: 'QR code do site', title: url });
    } else {
      box.textContent = 'Não foi possível gerar o QR code. Use o link abaixo.';
    }
    document.getElementById('qrUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    document.getElementById('qrShare').hidden = !navigator.share;
    if (qrDialog.showModal) qrDialog.showModal(); else qrDialog.setAttribute('open', '');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-qr]')) { openQr(); return; }
    // Clique fora da caixa fecha a janela.
    if (e.target === qrDialog) qrDialog.close();
  });
  var copyBtn = document.getElementById('qrCopy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var url = siteUrl();
    var done = function () { copyBtn.textContent = 'Link copiado ✓'; setTimeout(function () { copyBtn.textContent = 'Copiar link'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copie o link:', url); });
    else prompt('Copie o link:', url);
  });
  var shareBtn = document.getElementById('qrShare');
  if (shareBtn) shareBtn.addEventListener('click', function () {
    navigator.share({ title: 'StopMotion RAN', text: 'Vamos animar! Crie seu stop motion aqui:', url: siteUrl() }).catch(function () {});
  });
})();
