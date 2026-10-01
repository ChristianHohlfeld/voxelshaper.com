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
      bodyIndices: [],
      rayDistance: 0
    };

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
      if (drag.active) box.endMouseGrab?.();
      drag.active = false;
      drag.pointerId = null;
      drag.bodyIndex = -1;
      drag.bodyIndices = [];
      drag.rayDistance = 0;
      canvas.style.cursor = physicsOwnsCanvas() && box.running ? 'grab' : previousCursor;
    }

    function onPointerDown(event) {
      if (!physicsOwnsCanvas() || !eventIsOnCanvas(event)) return;
      consume(event);

      // While Play owns the canvas, Orbit/Edit never receive this pointer.
      if (!box.running || event.button > 0 || event.isPrimary === false) return;

      const hit = box.pickBodyAtPointer?.(event.clientX, event.clientY);
      if (!hit || hit.index < 0 || !hit.point || !Number.isFinite(hit.distance)) return;

      // Physics uses the exact same NxN face brush semantics as editing.
      // 1x1 grabs one voxel; 3x3 grabs the existing voxels in that 3x3 face patch, etc.
      const bodyIndices = box.brushBodyIndices?.(hit, app.brushSize) || [hit.index];
      if (!box.beginMouseGrab?.(bodyIndices, hit.point, 100)) return;

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.bodyIndex = hit.index;
      drag.bodyIndices = box.mouseGrabBodyIndices || bodyIndices.slice();
      drag.rayDistance = hit.distance;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    }

    function onPointerMove(event) {
      if (!physicsOwnsCanvas()) return;
      const ownsThisPointer = drag.active && event.pointerId === drag.pointerId;
      if (!ownsThisPointer && !eventIsOnCanvas(event)) return;
      consume(event);
      if (!ownsThisPointer || !box.running) return;

      // True 3D drag: rebuild the camera ray at the new pointer location and move
      // the native Box3D mouse body to the same pick-ray depth as the original hit.
      const target = box.pointAtPointerDistance?.(event.clientX, event.clientY, drag.rayDistance);
      if (target) box.updateMouseGrab?.(target);
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

    // Capture before all legacy controls: exactly one mode owns a pointer.
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
    const timer = setInterval(sync, 80);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });

    window.VoxelPhysicsInputRouter = {
      installed: true,
      get mode() {
        if (physicsOwnsCanvas()) return 'physics';
        if (app.mobileCanvasMode === 'edit') return 'edit';
        return 'orbit';
      },
      get dragging() { return drag.active; },
      get bodyIndex() { return drag.bodyIndex; },
      get bodyIndices() { return drag.bodyIndices.slice(); },
      cancelDrag
    };
    sync();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 60);
  install();
})();
