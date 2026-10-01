(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const box = window.VoxelBox3D;
    const canvas = app?.cvs;
    if (!app || !canvas || !physics?.simpleMode || !box?.installed) return false;
    if (window.VoxelPhysicsInputRouter?.installed) return true;

    const drag = {
      active: false,
      pointerId: null,
      bodyIndex: -1,
      lastX: 0,
      lastY: 0,
      lastAt: 0
    };

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const force = new THREE.Vector3();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const previousTouchAction = canvas.style.touchAction;
    const previousCursor = canvas.style.cursor;

    function physicsOwnsCanvas() {
      return !!physics.state?.enabled;
    }

    function eventIsOnCanvas(event) {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      return event.target === canvas || path.includes(canvas);
    }

    function consume(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function cancelDrag() {
      drag.active = false;
      drag.pointerId = null;
      drag.bodyIndex = -1;
      drag.lastX = 0;
      drag.lastY = 0;
      drag.lastAt = 0;
      canvas.style.cursor = physicsOwnsCanvas() && box.running ? 'grab' : previousCursor;
    }

    function applyScreenDrag(dx, dy, dtMs) {
      if (!drag.active || drag.bodyIndex < 0 || !box.running) return false;
      const camera = app.cam || app.camera;
      if (!camera) return false;

      right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

      // Screen-space finger motion becomes acceleration in the camera plane.
      // The gain is velocity-sensitive but clamped so a fast swipe cannot tunnel
      // through Box3D's six-sided editor boundary.
      const speedGain = clamp(16 / Math.max(8, dtMs), .7, 1.75);
      const perPixel = clamp((app.VS || 1) * 7.0, 4, 20) * speedGain;
      force.copy(right).multiplyScalar(dx * perPixel)
        .addScaledVector(up, -dy * perPixel);
      const max = 1500;
      if (force.length() > max) force.setLength(max);
      return !!box.applyForceToBody?.(drag.bodyIndex, force.x, force.y, force.z, 1);
    }

    function onPointerDown(event) {
      if (!physicsOwnsCanvas() || !eventIsOnCanvas(event)) return;
      consume(event);

      // Physics mode owns the canvas even before Play: no orbit/edit fallback.
      if (!box.running || event.button > 0 || event.isPrimary === false) return;
      const index = box.bodyAtPointer?.(event.clientX, event.clientY) ?? -1;
      if (index < 0) return;

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.bodyIndex = index;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastAt = performance.now();
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    }

    function onPointerMove(event) {
      if (!physicsOwnsCanvas()) return;
      const ownsThisPointer = drag.active && event.pointerId === drag.pointerId;
      if (!ownsThisPointer && !eventIsOnCanvas(event)) return;
      consume(event);
      if (!ownsThisPointer || !box.running) return;

      const now = performance.now();
      applyScreenDrag(event.clientX - drag.lastX, event.clientY - drag.lastY, now - drag.lastAt);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastAt = now;
    }

    function onPointerEnd(event) {
      if (!physicsOwnsCanvas()) return;
      const ownsThisPointer = drag.active && event.pointerId === drag.pointerId;
      if (!ownsThisPointer && !eventIsOnCanvas(event)) return;
      consume(event);
      if (!ownsThisPointer) return;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
      cancelDrag();
    }

    function blockLegacyMouse(event) {
      if (!physicsOwnsCanvas()) return;
      if (!drag.active && !eventIsOnCanvas(event)) return;
      consume(event);
    }

    // Window capture runs before the existing canvas-level mobile/desktop controls.
    // That makes ownership deterministic regardless of listener registration order.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerEnd, true);
    window.addEventListener('pointercancel', onPointerEnd, true);
    ['mousedown','mousemove','mouseup','contextmenu','wheel'].forEach((name) => {
      window.addEventListener(name, blockLegacyMouse, { capture:true, passive:false });
    });

    const sync = () => {
      if (physicsOwnsCanvas()) {
        canvas.style.touchAction = 'none';
        canvas.style.cursor = box.running ? (drag.active ? 'grabbing' : 'grab') : 'default';
      } else {
        if (drag.active) cancelDrag();
        canvas.style.touchAction = previousTouchAction;
        canvas.style.cursor = previousCursor;
      }
    };
    const timer = setInterval(sync, 100);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });

    window.VoxelPhysicsInputRouter = {
      installed: true,
      get mode() {
        if (physicsOwnsCanvas()) return 'physics';
        if (app.mobileCanvasMode === 'edit') return 'edit';
        return 'orbit';
      },
      get dragging() { return drag.active; },
      cancelDrag,
      applyScreenDrag
    };
    sync();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 60);
  install();
})();
