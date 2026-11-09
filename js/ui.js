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
})();
