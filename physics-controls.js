(function () {
  'use strict';

  const VERSION = '2.1.0-play-only';

  function install() {
    const app = window.VoxelApp;
    if (!app || !app.scene || !app.voxels) return false;
    if (window.VoxelPhysics?.playOnly) return true;

    ['vs-physics-panel','vs-physics-toggle-mobile','vs-physics-toolbar','vs-physics-hud','vs-physics-toggle-desktop'].forEach((id) => {
      document.getElementById(id)?.remove();
    });

    const state = {
      enabled: false,
      running: false,
      preview: null,
      simpleMode: true,
      playOnly: true
    };

    document.getElementById('vs-physics-simple-style')?.remove();
    const style = document.createElement('style');
    style.id = 'vs-physics-simple-style';
    style.textContent = `
      #vs-physics-test {
        position: fixed;
        z-index: 1200;
        left: 18px;
        right: auto;
        transform: none;
        bottom: 92px;
        width: 54px;
        height: 54px;
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
        font-size: 18px;
      }
      #vs-physics-test[aria-pressed="true"] {
        border-color: rgba(103,232,249,.78);
        box-shadow: 0 0 0 2px rgba(103,232,249,.14), 0 10px 28px rgba(0,0,0,.28);
      }
      @media (max-width: 899px), (pointer: coarse) {
        #vs-physics-test {
          left: max(14px, env(safe-area-inset-left));
          bottom: calc(var(--safe-bottom, env(safe-area-inset-bottom)) + 8.25rem);
        }
      }
    `;
    document.head.appendChild(style);

    let play = document.getElementById('vs-physics-test');
    if (!play) {
      play = document.createElement('button');
      play.id = 'vs-physics-test';
      play.type = 'button';
      play.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
      document.body.appendChild(play);
    }
    play.disabled = false;
    play.setAttribute('aria-label', 'Play physics');
    play.setAttribute('aria-pressed', 'false');

    function syncUi() {
      const running = !!window.VoxelBox3D?.running || !!state.running;
      play.disabled = false;
      play.style.display = 'flex';
      play.setAttribute('aria-pressed', running ? 'true' : 'false');
      play.setAttribute('aria-label', running ? 'Stop physics and reset' : 'Play physics');
      play.title = running ? 'Stop + Reset' : 'Play Physics';
      const icon = play.querySelector('i');
      if (icon) icon.className = running ? 'fas fa-stop' : 'fas fa-play';
    }

    // Internal lifecycle hooks only. There is no separate user-facing Physics mode.
    function enable() {
      state.enabled = true;
      syncUi();
      return true;
    }

    function disable() {
      try { window.VoxelBox3D?.stop?.(); } catch (_) {}
      state.running = false;
      state.preview = null;
      state.enabled = false;
      syncUi();
      return true;
    }

    function toggle() {
      return window.VoxelBox3D?.toggle?.() || false;
    }

    if (!app.__physicsSimpleLoadWrapped && typeof app.loadFromData === 'function') {
      app.__physicsSimpleLoadWrapped = true;
      const originalLoad = app.loadFromData;
      app.loadFromData = function (...args) {
        try { window.VoxelBox3D?.stop?.(); } catch (_) {}
        state.enabled = false;
        state.running = false;
        state.preview = null;
        return originalLoad.apply(this, args);
      };
    }

    window.VoxelPhysics = {
      version: VERSION,
      simpleMode: true,
      playOnly: true,
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
