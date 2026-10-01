(function () {
  'use strict';

  function isMobileSurface(app) {
    return !!(app?.isMobile || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900);
  }

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const btn = document.getElementById('mobile-canvas-mode-toggle');
    if (!app || !physics || !btn || !isMobileSurface(app)) return false;
    if (btn.dataset.physicsCycleBound === '1') return true;
    btn.dataset.physicsCycleBound = '1';

    document.getElementById('vs-physics-toggle-mobile')?.remove();

    if (!document.getElementById('vs-physics-cycle-style')) {
      const style = document.createElement('style');
      style.id = 'vs-physics-cycle-style';
      style.textContent = `
        #mobile-canvas-mode-toggle.is-physics {
          border-color: rgba(167, 139, 250, 0.95) !important;
          background: rgba(46, 16, 101, 0.95) !important;
          color: #c4b5fd !important;
        }
        #mobile-canvas-mode-toggle .physics-mode-icon {
          display: none;
          font-size: 1.1rem;
          pointer-events: none;
        }
        #mobile-canvas-mode-toggle.is-physics .physics-mode-icon {
          display: inline-block;
        }
      `;
      document.head.appendChild(style);
    }

    let physicsIcon = btn.querySelector('.physics-mode-icon');
    if (!physicsIcon) {
      physicsIcon = document.createElement('i');
      physicsIcon.className = 'fas fa-project-diagram physics-mode-icon';
      physicsIcon.setAttribute('aria-hidden', 'true');
      btn.appendChild(physicsIcon);
    }

    const sync = () => {
      document.getElementById('vs-physics-toggle-mobile')?.remove();
      const physicsOn = !!physics.state?.enabled;
      const mode = physicsOn ? 'physics' : (app.mobileCanvasMode === 'edit' ? 'edit' : 'view');
      const arrows = btn.querySelector('.orbit-arrows');
      const cube = btn.querySelector('.orbit-iso-cube');

      btn.classList.toggle('is-edit', mode === 'edit');
      btn.classList.toggle('is-physics', mode === 'physics');
      btn.dataset.mode = mode;
      btn.setAttribute('aria-pressed', mode === 'view' ? 'false' : 'true');

      if (arrows) arrows.style.display = mode === 'view' ? 'inline-block' : 'none';
      if (cube) cube.style.display = mode === 'edit' ? 'block' : 'none';
      physicsIcon.style.display = mode === 'physics' ? 'inline-block' : 'none';

      const label = mode === 'view'
        ? 'Orbit view'
        : mode === 'edit'
          ? 'Edit voxels'
          : 'Physics joints';
      btn.title = label;
      btn.setAttribute('aria-label', `${label}. Tap to switch mode.`);
    };

    const toast = (mode) => {
      if (typeof app.showToast !== 'function') return;
      if (mode === 'view') app.showToast('Orbit', 'Drag to look around', 'info', 900);
      else if (mode === 'edit') app.showToast('Edit', 'Tap to place, erase or paint', 'info', 900);
      else app.showToast('Physics', 'Select Base A, Moving B, then place the anchor', 'info', 1100);
    };

    const setMode = (mode) => {
      if (mode === 'physics') {
        app.mobileCanvasMode = app.mobileCanvasMode === 'edit' ? 'edit' : 'view';
        physics.enable();
      } else {
        if (physics.state?.enabled) physics.disable();
        app.mobileCanvasMode = mode;
      }
      sync();
      toast(mode);
    };

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = physics.state?.enabled
        ? 'physics'
        : (app.mobileCanvasMode === 'edit' ? 'edit' : 'view');
      const next = current === 'view' ? 'edit' : current === 'edit' ? 'physics' : 'view';
      setMode(next);
    }, true);

    app.updateMobileCanvasModeUI = sync;
    sync();

    const timer = window.setInterval(() => {
      if (!document.documentElement.contains(btn)) {
        window.clearInterval(timer);
        return;
      }
      sync();
    }, 300);

    return true;
  }

  const timer = window.setInterval(() => {
    if (install()) window.clearInterval(timer);
  }, 100);
  window.setTimeout(() => {
    window.clearInterval(timer);
    install();
  }, 10000);
})();
