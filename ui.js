// UI controls are intentionally independent from the 3D renderer. This keeps
// the toolbox usable while the Three.js module is loading or if a Chromebook
// temporarily blocks the CDN.
(() => {
  let selectedPart = 'brick2x4';
  let selectedColor = 'red';
  const labels = {
    brick2x4: ['Brick 2 × 4', '2 × 4'],
    brick2x2: ['Brick 2 × 2', '2 × 2'],
    plate4x4: ['Plate 4 × 4', '4 × 4'],
    slope2x2: ['Slope 2 × 2', '2 × 2'],
    tnt: ['TNT Crate', '2 × 2'],
    door: ['Door 3 × 4', '3 × 4'],
    window: ['Window 2 × 2', '2 × 2']
  };
  const partOrder = ['brick2x4', 'brick2x2', 'plate4x4', 'slope2x2', 'tnt', 'door', 'window'];

  function normalizePartOrder() {
    const list = document.querySelector('#part-list');
    if (!list) return;
    const cards = [...list.querySelectorAll('.part-card')];
    cards.sort((a, b) => partOrder.indexOf(a.dataset.part) - partOrder.indexOf(b.dataset.part));
    cards.forEach(card => list.appendChild(card));
  }

  function paintPreview() {
    const preview = document.querySelector('#current-piece-preview');
    const current = labels[selectedPart];
    if (!preview || !current) return;
    preview.style.background = getComputedStyle(document.querySelector(`[data-color="${selectedColor}"]`)).getPropertyValue('--swatch');
    document.querySelector('#current-piece-name').textContent = current[0];
    document.querySelector('#current-piece-meta').textContent = `${selectedColor[0].toUpperCase() + selectedColor.slice(1)} · ${current[1]}`;
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1300);
  }

  function selectPart(type, notify = true) {
    if (!labels[type]) return;
    selectedPart = type;
    document.querySelectorAll('.part-card').forEach(card => card.classList.toggle('active', card.dataset.part === type));
    paintPreview();
    if (notify) window.dispatchEvent(new CustomEvent('brickcraft:part', { detail: type }));
  }

  function selectColor(color, notify = true) {
    selectedColor = color;
    document.querySelectorAll('.color-swatch').forEach(swatch => swatch.classList.toggle('active', swatch.dataset.color === color));
    paintPreview();
    if (notify) window.dispatchEvent(new CustomEvent('brickcraft:color', { detail: color }));
  }

  document.addEventListener('click', event => {
    const part = event.target.closest('.part-card');
    if (part) selectPart(part.dataset.part);
    const color = event.target.closest('.color-swatch');
    if (color) selectColor(color.dataset.color);
    const reset = event.target.closest('#reset-world');
    if (reset) {
      showToast('Fresh canvas ready.');
      window.dispatchEvent(new Event('brickcraft:reset'));
    }
  });

  document.addEventListener('keydown', event => {
    const shortcuts = { Digit1: 'brick2x4', Digit2: 'brick2x2', Digit3: 'plate4x4', Digit4: 'slope2x2', Digit5: 'tnt', Digit6: 'door', Digit7: 'window' };
    if (shortcuts[event.code]) selectPart(shortcuts[event.code]);
  });

  normalizePartOrder();
  paintPreview();
})();
