(function () {
  'use strict';

  function isMobileSurface(app) {
    return !!(app?.isMobile || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900);
  }

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const box = window.VoxelBox3D;
    const btn = document.getElementById('mobile-canvas-mode-toggle');
    if (!app || !physics?.simpleMode || !box?.hardened || !btn || !isMobileSurface(app)) return false;
    if (btn.dataset.physicsSimpleBound === '1') return true;
    btn.dataset.physicsSimpleBound = '1';

    // Remove every legacy joint-authoring surface. Simple mode has Play/Pause only.
    ['vs-physics-toggle-mobile','vs-physics-toolbar','vs-physics-hud','vs-physics-panel'].forEach((id) => {
      document.getElementById(id)?.remove();
    });

    let physicsIcon = btn.querySelector('.physics-mode-icon');
    if (!physicsIcon) {
      physicsIcon = document.createElement('i');
      physicsIcon.className = 'fas fa-cubes physics-mode-icon';
      physicsIcon.setAttribute('aria-hidden', 'true');
      physicsIcon.style.pointerEvents = 'none';
      btn.appendChild(physicsIcon);
    }

    const style = document.createElement('style');
    style.id = 'vs-physics-simple-mobile-style';
    style.textContent = `
      @media (max-width: 899px), (pointer: coarse) {
        #mobile-canvas-mode-toggle.is-edit,
        #mobile-canvas-mode-toggle.is-physics {
          border-color: rgba(255,255,255,.55) !important;
          background: rgba(17,24,39,.92) !important;
          color: inherit !important;
          box-shadow: none !important;
        }
        #mobile-canvas-mode-toggle .physics-mode-icon { display:none; font-size:1.05rem; }
      }
    `;
    document.head.appendChild(style);

    function syncCycleButton() {
      const physicsOn = !!physics.state?.enabled;
      const mode = physicsOn ? 'physics' : (app.mobileCanvasMode === 'edit' ? 'edit' : 'view');
      const arrows = btn.querySelector('.orbit-arrows');
      const cube = btn.querySelector('.orbit-iso-cube');

      btn.classList.remove('is-edit', 'is-physics');
      btn.dataset.mode = mode;
      btn.setAttribute('aria-pressed', mode === 'view' ? 'false' : 'true');
      if (arrows) arrows.style.display = mode === 'view' ? 'inline-block' : 'none';
      if (cube) cube.style.display = mode === 'edit' ? 'block' : 'none';
      physicsIcon.style.display = mode === 'physics' ? 'inline-block' : 'none';

      const label = mode === 'view' ? 'Orbit view' : mode === 'edit' ? 'Edit voxels' : 'Physics';
      btn.title = label;
      btn.setAttribute('aria-label', `${label}. Tap to switch mode.`);
      physics.syncUi?.();
      box.syncUi?.();
    }

    function enterPhysics() {
      app.mobileCanvasMode = 'view';
      physics.enable();
      syncCycleButton();
    }

    function leavePhysics(mode) {
      physics.disable();
      app.mobileCanvasMode = mode;
      app.updateMobileCanvasModeUI?.();
      syncCycleButton();
    }

    function setMode(mode) {
      if (mode === 'physics') enterPhysics();
      else leavePhysics(mode);
    }

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = physics.state?.enabled ? 'physics' : (app.mobileCanvasMode === 'edit' ? 'edit' : 'view');
      const next = current === 'view' ? 'edit' : current === 'edit' ? 'physics' : 'view';
      setMode(next);
    }, true);

    const timer = setInterval(syncCycleButton, 140);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
    syncCycleButton();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
