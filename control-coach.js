/*
 * Orbit / Edit controls + gesture-intent coaching (mobile and desktop).
 *
 * - app.mobileCanvasMode: 'view' = Orbit (navigate only, never edits), 'edit' = place/delete/paint.
 * - Orbit button (bottom-right) toggles Orbit; the mode switch above it leaves Orbit
 *   (first tap enters Edit, further taps cycle Add/Delete/Paint as before). Space does the same toggle.
 * - Coaching is visual only and never blocks or alters a gesture:
 *     stage 1  orbit hint       drag outside Orbit that is not a voxel action -> pulse Orbit
 *              mode_switch hint tap / long-press while in Orbit              -> pulse mode switch
 *   Each hint is throttled (8 s) and retires once the user has used the right mode a few times.
 *   Stage 2 (delete / paint / colour coaching) is intentionally not implemented yet: add entries to
 *   HINTS with stage: 2 and they unlock only after every stage-1 hint has retired.
 */
(function () {
  'use strict';

  const STORE_KEY = 'vs_control_coach_v1';
  const THROTTLE_MS = 8000;
  const LEARNED_AFTER = 3;
  const DRAG_PX = 12;
  const TAP_SLOP_PX = 10;
  const LONG_PRESS_MS = 450;

  const HINTS = {
    orbit: { stage: 1, target: () => visible(['mobile-canvas-mode-toggle', 'desktop-overlay-orbit-toggle']) },
    mode_switch: { stage: 1, target: () => visible(['mobile-mode-toggle', 'desktop-overlay-mode-toggle']) }
    // stage 2 (later): delete / paint / colour hints, e.g. { stage: 2, target: ... }
  };

  let app = null;
  let installed = false;
  let store = { orbitUses: 0, editUses: 0 };
  const lastPulseAt = {};
  const pointers = new Map();
  let gesture = null;

  function load() {
    try { store = Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (_) { }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { }
  }
  function track(name, params) {
    try { if (typeof window.trackEvent === 'function') window.trackEvent(name, params); } catch (_) { }
  }
  function visible(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length) return el;
    }
    return null;
  }
  function physicsRunning() {
    return !!window.VoxelPhysics?.state?.enabled;
  }
  function uiMode() {
    return app?.isMobile ? 'mobile' : 'desktop';
  }
  function hintRetired(name) {
    if (name === 'orbit') return store.orbitUses >= LEARNED_AFTER;
    if (name === 'mode_switch') return store.editUses >= LEARNED_AFTER;
    return true;
  }
  function stageUnlocked(stage) {
    if (stage <= 1) return true;
    return Object.keys(HINTS).every((name) => HINTS[name].stage >= stage || hintRetired(name));
  }
  function learn(field) {
    if ((store[field] || 0) >= LEARNED_AFTER) return;
    store[field] = (store[field] || 0) + 1;
    save();
  }

  function pulse(name, trigger) {
    const hint = HINTS[name];
    if (!hint || !stageUnlocked(hint.stage) || hintRetired(name)) return false;
    if (physicsRunning() || document.querySelector('dialog[open]')) return false;
    const now = performance.now();
    if (lastPulseAt[name] && now - lastPulseAt[name] < THROTTLE_MS) return false;
    const el = hint.target();
    if (!el) return false;
    lastPulseAt[name] = now;
    el.classList.remove('vs-coach-pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('vs-coach-pulse');
    clearTimeout(el._vsCoachTimer);
    el._vsCoachTimer = setTimeout(() => el.classList.remove('vs-coach-pulse'), 1300);
    // Haptics where supported (Android); iOS Safari has no vibrate API, the visual pulse carries it.
    try { if (typeof navigator.vibrate === 'function') navigator.vibrate(20); } catch (_) { }
    track('control_coach_pulse', { hint: name, trigger, canvas_mode: app.mobileCanvasMode, ui_mode: uiMode() });
    return true;
  }

  // ---------- Orbit / Edit state ----------
  function syncControls() {
    const mode = app.mobileCanvasMode === 'edit' ? 'edit' : 'view';
    document.body.dataset.canvasMode = mode;
    const desk = document.getElementById('desktop-overlay-orbit-toggle');
    if (desk) {
      desk.setAttribute('aria-pressed', mode === 'view' ? 'true' : 'false');
      desk.title = mode === 'view' ? 'Orbit is on: drag to look around (Space = Edit)' : 'Orbit (Space)';
    }
    const mobile = document.getElementById('mobile-canvas-mode-toggle');
    if (mobile && !physicsRunning()) mobile.classList.toggle('is-edit', mode === 'edit');
    if (mode === 'view' && app.previewVoxel) app.previewVoxel.visible = false;
    if (mode === 'view' && app.previewBrush) app.previewBrush.visible = false;
  }

  function setCanvasMode(next, trigger) {
    const prev = app.mobileCanvasMode === 'edit' ? 'edit' : 'view';
    if (prev === next) { syncControls(); return; }
    app.mobileCanvasMode = next;
    track('canvas_mode_change', { from: prev, to: next, trigger, ui_mode: uiMode() });
  }

  function toggleOrbitEditMode(trigger) {
    if (physicsRunning()) return;
    if (typeof app.isFlyControlsMode === 'function' && app.isFlyControlsMode()) {
      app.setCameraControlMode?.('orbit', { announce: false });
      setCanvasMode('view', trigger);
      return;
    }
    const next = app.mobileCanvasMode === 'view' ? 'edit' : 'view';
    setCanvasMode(next, trigger);
    learn(next === 'view' ? 'orbitUses' : 'editUses');
  }

  function installModeAccessor() {
    let mode = app.mobileCanvasMode || (app.isMobile ? 'view' : 'edit');
    const desc = Object.getOwnPropertyDescriptor(app, 'mobileCanvasMode');
    if (desc && desc.get) return;
    Object.defineProperty(app, 'mobileCanvasMode', {
      configurable: true,
      enumerable: true,
      get() { return mode; },
      set(value) {
        mode = value;
        try { syncControls(); } catch (_) { }
      }
    });
  }

  // ---------- Gesture observation (capture, passive: never alters the gesture) ----------
  function onDown(e) {
    if (e.target !== app.cvs) return;
    pointers.set(e.pointerId, true);
    clearTimeout(gesture?.holdTimer);
    if (pointers.size > 1 || physicsRunning()) { gesture = null; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) { gesture = null; return; }
    let onTarget = false;
    try { onTarget = !!app.getRayTargetInfo?.(e.clientX, e.clientY); } catch (_) { }
    const mode = app.mobileCanvasMode === 'edit' ? 'edit' : 'view';
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), mode, onTarget, moved: false, voxels: app.voxels?.size || 0 };
    if (mode === 'view') {
      const g = gesture;
      g.holdTimer = setTimeout(() => {
        if (gesture === g && !g.moved && pointers.size === 1) { g.held = true; pulse('mode_switch', 'long_press'); }
      }, LONG_PRESS_MS);
    }
  }

  function onMove(e) {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    if (pointers.size > 1) { clearTimeout(g.holdTimer); gesture = null; return; }
    const dist = Math.hypot(e.clientX - g.x, e.clientY - g.y);
    if (!g.moved && dist > TAP_SLOP_PX) { g.moved = true; clearTimeout(g.holdTimer); }
    if (dist <= DRAG_PX || g.dragHandled) return;
    g.dragHandled = true;
    if (g.mode === 'edit' && !g.onTarget && !(app.currentStroke && app.currentStroke.size) && (app.voxels?.size || 0) === g.voxels) {
      pulse('orbit', 'drag');
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.holdTimer);
    gesture = null;
    if (g.mode === 'view') {
      if (g.moved) learn('orbitUses');
      else if (!g.held && performance.now() - g.t < LONG_PRESS_MS) pulse('mode_switch', 'tap');
    } else if ((app.currentStroke && app.currentStroke.size) || (app.voxels?.size || 0) !== g.voxels) {
      learn('editUses');
    }
  }

  function onCancel(e) {
    pointers.delete(e.pointerId);
    if (gesture && gesture.id === e.pointerId) { clearTimeout(gesture.holdTimer); gesture = null; }
  }

  function install() {
    app = window.VoxelApp;
    if (installed || !app || !app.cvs || !app.cam) return installed;
    installed = true;
    load();
    installModeAccessor();
    app.toggleOrbitEditMode = toggleOrbitEditMode;
    app.setCanvasMode = setCanvasMode;

    // Mode switch: inside Orbit the first tap leaves Orbit (keeps the current tool).
    ['mobile-mode-toggle', 'desktop-overlay-mode-toggle'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', (event) => {
        if (app.mobileCanvasMode !== 'view' || physicsRunning()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setCanvasMode('edit', 'mode_button');
        learn('editUses');
        try { app.flashModeButtons?.(); } catch (_) { }
      }, true);
    });

    document.getElementById('desktop-overlay-orbit-toggle')?.addEventListener('click', (event) => {
      event.preventDefault();
      toggleOrbitEditMode('orbit_button');
    });
    document.getElementById('mobile-canvas-mode-toggle')?.addEventListener('click', () => {
      setTimeout(() => {
        syncControls();
        if (physicsRunning()) return;
        const mode = app.mobileCanvasMode === 'edit' ? 'edit' : 'view';
        learn(mode === 'view' ? 'orbitUses' : 'editUses');
        track('canvas_mode_change', { to: mode, trigger: 'orbit_button', ui_mode: uiMode() });
      }, 0);
    });

    // Mobile colour circle: pressed state on pointerdown, lighter rendering while the native picker is open.
    const picker = document.getElementById('mobile-color-picker');
    if (picker) {
      const release = () => picker.classList.remove('is-pressed');
      const closePicker = () => { app._nativeColorPickerOpen = false; };
      picker.addEventListener('pointerdown', () => {
        picker.classList.add('is-pressed');
        app._nativeColorPickerOpen = true;
        clearTimeout(picker._vsPickerTimer);
        picker._vsPickerTimer = setTimeout(closePicker, 15000);
      }, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => picker.addEventListener(n, release, { passive: true }));
      ['change', 'blur'].forEach((n) => picker.addEventListener(n, closePicker));
      window.addEventListener('pointerdown', (e) => { if (e.target !== picker) closePicker(); }, { capture: true, passive: true });
    }

    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', onCancel, { capture: true, passive: true });

    syncControls();
    window.VoxelControlCoach = { pulse, toggleOrbitEditMode, setCanvasMode, get state() { return { ...store }; }, HINTS };
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 150);
  setTimeout(() => clearInterval(timer), 30000);
  install();
})();
