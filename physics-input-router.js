(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const box = window.VoxelBox3D;
    const canvas = app?.cvs;
    if (!app || !canvas || !physics?.simpleMode || !box?.installed) return false;
    if (window.VoxelPhysicsInputRouter?.installed) return true;

    const MAX_POINTER_GRABS = 2;
    const drags = new Map();
    const slotPointers = Array(MAX_POINTER_GRABS).fill(null);

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

    function freeSlot() {
      return slotPointers.findIndex((pointerId) => pointerId === null);
    }

    function cancelDrag(pointerId) {
      const drag = drags.get(pointerId);
      if (!drag) return false;
      box.endMouseGrab?.(drag.slot);
      drags.delete(pointerId);
      if (slotPointers[drag.slot] === pointerId) slotPointers[drag.slot] = null;
      canvas.style.cursor = physicsOwnsCanvas() && box.running ? (drags.size ? 'grabbing' : 'grab') : previousCursor;
      return true;
    }

    function cancelAllDrags() {
      for (const pointerId of [...drags.keys()]) cancelDrag(pointerId);
      box.endAllMouseGrabs?.();
      slotPointers.fill(null);
      canvas.style.cursor = physicsOwnsCanvas() && box.running ? 'grab' : previousCursor;
    }

    function onPointerDown(event) {
      if (!physicsOwnsCanvas() || !eventIsOnCanvas(event)) return;
      consume(event);

      // Physics owns every pointer while Play is active. Unlike the legacy router,
      // non-primary touch pointers are intentionally accepted so two fingers can
      // drive two independent native Box3D grab targets.
      if (!box.running || event.button > 0 || drags.has(event.pointerId)) return;
      const slot = freeSlot();
      if (slot < 0) return; // Third+ pointer is consumed but does not disturb either grab.

      const hit = box.pickBodyAtPointer?.(event.clientX, event.clientY);
      if (!hit || hit.index < 0 || !hit.point || !Number.isFinite(hit.distance)) return;
      const bodyIndices = box.brushBodyIndices?.(hit, app.brushSize) || [hit.index];
      if (!box.beginMouseGrab?.(bodyIndices, hit.point, 100, slot)) return;

      const drag = {
        pointerId:event.pointerId,
        pointerType:event.pointerType || 'mouse',
        slot,
        bodyIndex:hit.index,
        bodyIndices:box.mouseGrabBodyIndicesForSlot?.(slot) || bodyIndices.slice(),
        rayDistance:hit.distance
      };
      drags.set(event.pointerId, drag);
      slotPointers[slot] = event.pointerId;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    }

    function onPointerMove(event) {
      if (!physicsOwnsCanvas()) return;
      const drag = drags.get(event.pointerId);
      if (!drag && !eventIsOnCanvas(event)) return;
      consume(event);
      if (!drag || !box.running) return;

      const target = box.pointAtPointerDistance?.(event.clientX, event.clientY, drag.rayDistance);
      if (target) box.updateMouseGrab?.(target, drag.slot);
    }

    function onPointerEnd(event) {
      if (!physicsOwnsCanvas()) return;
      const drag = drags.get(event.pointerId);
      if (!drag && !eventIsOnCanvas(event)) return;
      consume(event);
      if (!drag) return;
      try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
      cancelDrag(event.pointerId);
    }

    function blockLegacyMouse(event) {
      if (!physicsOwnsCanvas()) return;
      if (!drags.size && !eventIsOnCanvas(event)) return;
      consume(event);
    }

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
        canvas.style.cursor = box.running ? (drags.size ? 'grabbing' : 'grab') : 'default';
      } else {
        if (drags.size) cancelAllDrags();
        canvas.style.touchAction = previousTouchAction;
        canvas.style.cursor = previousCursor;
      }
    };
    const timer = setInterval(sync, 80);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });

    window.VoxelPhysicsInputRouter = {
      installed:true,
      maxPointerGrabs:MAX_POINTER_GRABS,
      get mode() {
        if (physicsOwnsCanvas()) return 'physics';
        if (app.mobileCanvasMode === 'edit') return 'edit';
        return 'orbit';
      },
      get dragging(){ return drags.size > 0; },
      get activePointerCount(){ return drags.size; },
      get bodyIndex(){ return drags.values().next().value?.bodyIndex ?? -1; },
      get bodyIndices(){ return [...drags.values()].flatMap((drag)=>drag.bodyIndices); },
      get activeGrabs(){
        return [...drags.values()].map((drag)=>({
          pointerId:drag.pointerId,
          pointerType:drag.pointerType,
          slot:drag.slot,
          bodyIndex:drag.bodyIndex,
          bodyIndices:drag.bodyIndices.slice(),
          rayDistance:drag.rayDistance
        }));
      },
      cancelDrag,
      cancelAllDrags
    };
    sync();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 60);
  install();
})();
