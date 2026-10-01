(function () {
  'use strict';

  const VERSION = '2.0.0-simple';

  function install() {
    const app = window.VoxelApp;
    if (!app || !app.scene || !app.voxels) return false;
    if (window.VoxelPhysics?.simpleMode) return true;

    ['vs-physics-panel','vs-physics-toggle-mobile','vs-physics-toolbar','vs-physics-hud'].forEach((id) => {
      document.getElementById(id)?.remove();
    });

    const state = {
      enabled: false,
      running: false,
      preview: null,
      simpleMode: true,
      oldMobileMode: null
    };

    const style = document.createElement('style');
    style.id = 'vs-physics-simple-style';
    style.textContent = `
      #vs-physics-toggle-desktop,
      #vs-physics-test {
        position: fixed;
        z-index: 1200;
        width: 46px;
        height: 46px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.20);
        background: rgba(14,20,29,.92);
        color: rgba(255,255,255,.94);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 28px rgba(0,0,0,.28);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
      }
      #vs-physics-toggle-desktop { right: 18px; top: 128px; }
      #vs-physics-test {
        left: 50%;
        transform: translateX(-50%);
        bottom: 24px;
        display: none;
        width: 54px;
        height: 54px;
        font-size: 18px;
      }
      #vs-physics-test.show { display: flex; }
      #vs-physics-toggle-desktop.on,
      #vs-physics-test[aria-pressed="true"] {
        border-color: rgba(103,232,249,.78);
        box-shadow: 0 0 0 2px rgba(103,232,249,.14), 0 10px 28px rgba(0,0,0,.28);
      }
      @media (max-width: 899px), (pointer: coarse) {
        #vs-physics-toggle-desktop { display: none !important; }
        #vs-physics-test {
          left: max(14px, env(safe-area-inset-left));
          right: auto;
          transform: none;
          bottom: calc(var(--safe-bottom, env(safe-area-inset-bottom)) + 8.25rem);
          width: 54px;
          height: 54px;
          font-size: 18px;
        }
      }
    `;
    document.head.appendChild(style);

    const desktopToggle = document.createElement('button');
    desktopToggle.id = 'vs-physics-toggle-desktop';
    desktopToggle.type = 'button';
    desktopToggle.setAttribute('aria-label', 'Toggle physics mode');
    desktopToggle.innerHTML = '<i class="fas fa-cube" aria-hidden="true"></i>';
    document.body.appendChild(desktopToggle);

    const play = document.createElement('button');
    play.id = 'vs-physics-test';
    play.type = 'button';
    play.disabled = false;
    play.setAttribute('aria-label', 'Play physics');
    play.setAttribute('aria-pressed', 'false');
    play.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
    document.body.appendChild(play);

    function syncUi() {
      const running = !!window.VoxelBox3D?.running || !!state.running;
      desktopToggle.classList.toggle('on', state.enabled);
      desktopToggle.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
      desktopToggle.title = state.enabled ? 'Physics mode on' : 'Physics mode off';
      play.classList.toggle('show', state.enabled);
      play.disabled = false;
      play.setAttribute('aria-pressed', running ? 'true' : 'false');
      play.setAttribute('aria-label', running ? 'Pause and reset physics' : 'Play physics');
      const icon = play.querySelector('i');
      if (icon) icon.className = running ? 'fas fa-pause' : 'fas fa-play';
    }

    function enable() {
      if (state.enabled) { syncUi(); return true; }
      state.enabled = true;
      if (app.isMobile) {
        state.oldMobileMode = app.mobileCanvasMode;
        app.mobileCanvasMode = 'view';
        app.updateMobileCanvasModeUI?.();
      }
      syncUi();
      try { window.trackEvent?.('physics_simple_enable', { voxel_count: app.voxels.size }); } catch (_) {}
      return true;
    }

    function disable() {
      try { window.VoxelBox3D?.stop?.(); } catch (_) {}
      state.running = false;
      state.preview = null;
      state.enabled = false;
      if (app.isMobile && state.oldMobileMode != null) {
        app.mobileCanvasMode = state.oldMobileMode;
        app.updateMobileCanvasModeUI?.();
      }
      syncUi();
      return true;
    }

    function toggle() {
      return state.enabled ? disable() : enable();
    }

    desktopToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });

    if (!app.__physicsSimpleLoadWrapped && typeof app.loadFromData === 'function') {
      app.__physicsSimpleLoadWrapped = true;
      const originalLoad = app.loadFromData;
      app.loadFromData = function (...args) {
        try { window.VoxelBox3D?.stop?.(); } catch (_) {}
        return originalLoad.apply(this, args);
      };
    }

    window.VoxelPhysics = {
      version: VERSION,
      simpleMode: true,
      state,
      enable,
      disable,
      toggle,
      syncUi,
      serialize() { return { version: 2, mode: 'simple-rigid-voxels' }; }
    };
    app.physicsControls = state;
    syncUi();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
