(function () {
  'use strict';

  function isMobileSurface(app) {
    return !!(app?.isMobile || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900);
  }

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const btn = document.getElementById('mobile-canvas-mode-toggle');
    const canvas = app?.cvs;
    if (!app || !physics || !btn || !canvas || !isMobileSurface(app)) return false;
    if (btn.dataset.physicsCycleBound === '2') return true;
    btn.dataset.physicsCycleBound = '2';

    document.getElementById('vs-physics-toggle-mobile')?.remove();
    document.getElementById('vs-physics-direct-style')?.remove();
    document.getElementById('vs-physics-hud')?.remove();
    document.getElementById('vs-physics-toolbar')?.remove();

    const style = document.createElement('style');
    style.id = 'vs-physics-direct-style';
    style.textContent = `
      @media (max-width: 899px), (pointer: coarse) {
        #vs-physics-panel { display: none !important; }
        #mobile-canvas-mode-toggle.is-edit,
        #mobile-canvas-mode-toggle.is-physics {
          border-color: rgba(255,255,255,.55) !important;
          background: rgba(17,24,39,.92) !important;
          color: inherit !important;
          box-shadow: none !important;
        }
        #mobile-canvas-mode-toggle .physics-mode-icon {
          display:none;
          font-size:1.08rem;
          pointer-events:none;
        }
        #vs-physics-hud {
          position:fixed;
          left:50%;
          top:calc(max(12px, env(safe-area-inset-top)) + 4.2rem);
          transform:translateX(-50%);
          z-index:1100;
          max-width:calc(100vw - 32px);
          padding:.46rem .72rem;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.16);
          background:rgba(9,14,22,.82);
          backdrop-filter:blur(14px);
          color:rgba(255,255,255,.94);
          font:600 13px/1.15 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          pointer-events:none;
          opacity:0;
          transition:opacity .14s ease;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        #vs-physics-hud.show { opacity:1; }
        #vs-physics-toolbar {
          position:fixed;
          left:.55rem;
          right:5rem;
          bottom:calc(var(--safe-bottom, env(safe-area-inset-bottom)) + 4.85rem);
          z-index:1101;
          display:none;
          gap:.36rem;
          align-items:center;
          overflow-x:auto;
          overscroll-behavior-x:contain;
          scrollbar-width:none;
          padding:.4rem;
          border-radius:1rem;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(9,14,22,.84);
          backdrop-filter:blur(16px);
          box-shadow:0 10px 34px rgba(0,0,0,.28);
        }
        #vs-physics-toolbar::-webkit-scrollbar { display:none; }
        #vs-physics-toolbar.show { display:flex; }
        #vs-physics-toolbar button {
          flex:0 0 auto;
          min-width:2.8rem;
          height:2.55rem;
          padding:0 .66rem;
          border-radius:.78rem;
          border:1px solid rgba(255,255,255,.14);
          background:rgba(22,27,34,.96);
          color:rgba(255,255,255,.92);
          font:650 12px/1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        #vs-physics-toolbar button.on {
          border-color:rgba(255,255,255,.48);
          background:rgba(255,255,255,.13);
        }
        #vs-physics-toolbar button.icon-only { width:2.55rem; min-width:2.55rem; padding:0; }
      }
    `;
    document.head.appendChild(style);

    let physicsIcon = btn.querySelector('.physics-mode-icon');
    if (!physicsIcon) {
      physicsIcon = document.createElement('i');
      physicsIcon.className = 'fas fa-project-diagram physics-mode-icon';
      physicsIcon.setAttribute('aria-hidden', 'true');
      btn.appendChild(physicsIcon);
    }

    const hud = document.createElement('div');
    hud.id = 'vs-physics-hud';
    hud.setAttribute('aria-live', 'polite');
    document.body.appendChild(hud);

    const toolbar = document.createElement('div');
    toolbar.id = 'vs-physics-toolbar';
    toolbar.innerHTML = `
      <button type="button" data-type="hinge">Hinge</button>
      <button type="button" data-type="slider">Slider</button>
      <button type="button" data-type="fixed">Fixed</button>
      <button type="button" id="vs-physics-axis">Axis Y</button>
      <button type="button" id="vs-physics-motor"><i class="fas fa-bolt"></i> Motor</button>
      <button type="button" id="vs-physics-test" class="icon-only" aria-label="Play or stop physics test"><i class="fas fa-play"></i></button>
      <button type="button" id="vs-physics-new" class="icon-only" aria-label="Create new joint"><i class="fas fa-plus"></i></button>
      <button type="button" id="vs-physics-delete" class="icon-only" aria-label="Delete joint"><i class="fas fa-trash"></i></button>
    `;
    document.body.appendChild(toolbar);

    let entryJointCount = physics.state?.joints?.length || 0;
    let directJointId = null;
    let placing = false;
    let lastPhase = physics.state?.phase || 'a';
    let hudTimer = 0;
    const tapPointers = new Map();

    const activeJoint = () => physics.state?.joints?.find((j) => j.id === physics.state?.active) || null;

    const showHud = (text, sticky) => {
      window.clearTimeout(hudTimer);
      hud.textContent = text || '';
      hud.classList.toggle('show', !!text);
      if (text && !sticky) hudTimer = window.setTimeout(() => hud.classList.remove('show'), 1150);
    };

    const clickHidden = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.click();
      return true;
    };

    const currentAxis = (j) => {
      const a = j?.axis || [0,1,0];
      if (Math.abs(a[0]) > .8) return 'X';
      if (Math.abs(a[2]) > .8) return 'Z';
      return 'Y';
    };

    const forceStopTest = () => {
      physics.state.running = false;
      const preview = physics.state.preview;
      if (preview) {
        preview.parent?.remove(preview);
        physics.state.preview = null;
      }
    };

    const selectJoint = (id) => {
      const j = physics.state?.joints?.find((x) => x.id === id);
      if (!j) return false;
      forceStopTest();
      const sel = document.getElementById('vsp-sel');
      if (sel) {
        sel.value = id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        physics.state.active = id;
      }
      directJointId = id;
      placing = false;
      physics.newJoint?.();
      showHud(j.name || 'Joint selected', false);
      syncToolbar();
      return true;
    };

    const projectJoint = (j) => {
      const camera = app.camera || app.cam || app.activeCamera || app.currentCamera;
      if (!camera || !j?.anchor || typeof THREE === 'undefined') return null;
      const rect = canvas.getBoundingClientRect();
      const p = new THREE.Vector3(j.anchor[0], j.anchor[1], j.anchor[2]);
      p.project(camera);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z < -1.25 || p.z > 1.25) return null;
      return {
        x: rect.left + (p.x + 1) * .5 * rect.width,
        y: rect.top + (1 - p.y) * .5 * rect.height
      };
    };

    const jointNear = (x, y) => {
      let best = null;
      let bestD = 44;
      for (const j of physics.state?.joints || []) {
        const p = projectJoint(j);
        if (!p) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestD) { best = j; bestD = d; }
      }
      return best;
    };

    const syncToolbar = () => {
      const j = activeJoint();
      const show = !!(physics.state?.enabled && !placing && directJointId && j && j.id === directJointId);
      toolbar.classList.toggle('show', show);
      if (!show) return;
      toolbar.querySelectorAll('[data-type]').forEach((el) => el.classList.toggle('on', el.dataset.type === j.type));
      const axisBtn = toolbar.querySelector('#vs-physics-axis');
      if (axisBtn) axisBtn.textContent = `Axis ${currentAxis(j)}`;
      toolbar.querySelector('#vs-physics-motor')?.classList.toggle('on', !!j.motor?.enabled);
      const testIcon = toolbar.querySelector('#vs-physics-test i');
      if (testIcon) testIcon.className = physics.state?.running ? 'fas fa-stop' : 'fas fa-play';
    };

    const startNew = () => {
      forceStopTest();
      directJointId = null;
      placing = true;
      entryJointCount = physics.state?.joints?.length || 0;
      physics.newJoint?.();
      lastPhase = physics.state?.phase || 'a';
      toolbar.classList.remove('show');
      showHud('', false);
    };

    toolbar.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    toolbar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const typeBtn = e.target.closest('[data-type]');
      if (typeBtn) {
        clickHidden(`#vs-physics-panel [data-pt="${typeBtn.dataset.type}"]`);
        syncToolbar();
        return;
      }
      if (e.target.closest('#vs-physics-axis')) {
        const axis = currentAxis(activeJoint());
        const next = axis === 'X' ? 'y' : axis === 'Y' ? 'z' : 'x';
        clickHidden(`#vs-physics-panel [data-pa="${next}"]`);
        syncToolbar();
        return;
      }
      if (e.target.closest('#vs-physics-motor')) {
        const mot = document.getElementById('vsp-mot');
        if (mot) {
          mot.checked = !mot.checked;
          mot.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncToolbar();
        return;
      }
      if (e.target.closest('#vs-physics-test')) {
        if (physics.state?.running) forceStopTest();
        else clickHidden('#vsp-play');
        syncToolbar();
        return;
      }
      if (e.target.closest('#vs-physics-new')) {
        startNew();
        return;
      }
      if (e.target.closest('#vs-physics-delete')) {
        forceStopTest();
        clickHidden('#vsp-del');
        directJointId = null;
        placing = (physics.state?.joints?.length || 0) === 0;
        if (placing) physics.newJoint?.();
        showHud('', false);
        syncToolbar();
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (!physics.state?.enabled) return;
      tapPointers.set(e.pointerId, { x:e.clientX, y:e.clientY, t:performance.now(), moved:false });
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = tapPointers.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) p.moved = true;
    });
    canvas.addEventListener('pointercancel', (e) => tapPointers.delete(e.pointerId));
    canvas.addEventListener('pointerup', (e) => {
      const p = tapPointers.get(e.pointerId);
      tapPointers.delete(e.pointerId);
      if (!physics.state?.enabled || placing || !p || p.moved || performance.now() - p.t > 650) return;
      const j = jointNear(e.clientX, e.clientY);
      if (j) selectJoint(j.id);
    });

    const syncCycleButton = () => {
      document.getElementById('vs-physics-toggle-mobile')?.remove();
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
      const label = mode === 'view' ? 'Orbit view' : mode === 'edit' ? 'Edit voxels' : 'Physics joints';
      btn.title = label;
      btn.setAttribute('aria-label', `${label}. Tap to switch mode.`);
    };

    const enterPhysics = () => {
      entryJointCount = physics.state?.joints?.length || 0;
      directJointId = null;
      placing = entryJointCount === 0;
      app.mobileCanvasMode = 'view';
      physics.enable();
      if (placing) physics.newJoint?.();
      lastPhase = physics.state?.phase || 'a';
      showHud('', false);
      syncToolbar();
    };

    const leavePhysics = (mode) => {
      forceStopTest();
      if (physics.state?.enabled) physics.disable();
      directJointId = null;
      placing = false;
      toolbar.classList.remove('show');
      showHud('', false);
      app.mobileCanvasMode = mode;
    };

    const setMode = (mode) => {
      if (mode === 'physics') enterPhysics();
      else leavePhysics(mode);
      syncCycleButton();
    };

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = physics.state?.enabled ? 'physics' : (app.mobileCanvasMode === 'edit' ? 'edit' : 'view');
      const next = current === 'view' ? 'edit' : current === 'edit' ? 'physics' : 'view';
      setMode(next);
    }, true);

    app.updateMobileCanvasModeUI = syncCycleButton;
    syncCycleButton();

    const timer = window.setInterval(() => {
      if (!document.documentElement.contains(btn)) {
        window.clearInterval(timer);
        return;
      }
      syncCycleButton();
      if (!physics.state?.enabled) {
        toolbar.classList.remove('show');
        showHud('', false);
        return;
      }

      const phase = physics.state?.phase || 'a';
      const jointCount = physics.state?.joints?.length || 0;

      if (placing) {
        if (jointCount > entryJointCount) {
          const j = activeJoint();
          if (j) {
            directJointId = j.id;
            entryJointCount = jointCount;
            placing = false;
            showHud('Joint gesetzt', false);
            syncToolbar();
          }
        } else if (phase !== lastPhase) {
          if (phase === 'b') showHud('A gesetzt · B antippen', true);
          else if (phase === 'anchor') showHud('A + B · Verbindungspunkt antippen', true);
          else if (phase === 'a') showHud('', false);
        }
      } else if (phase !== 'a') {
        // Existing-joint mode is selection/edit only. A new A/B placement starts exclusively via +.
        physics.newJoint?.();
      }

      if (directJointId && !physics.state?.joints?.some((j) => j.id === directJointId)) directJointId = null;
      lastPhase = physics.state?.phase || 'a';
      syncToolbar();
    }, 90);

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
