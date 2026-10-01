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
    const modeButton = document.getElementById('mobile-canvas-mode-toggle');

    const previousTouchAction = canvas.style.touchAction;
    const previousCursor = canvas.style.cursor;
    let interactionMode = 'grab';
    let wasRunning = false;
    let savedCanvasMode = null;

    let grabIcon = null;
    if (modeButton) {
      grabIcon = modeButton.querySelector('.physics-grab-icon');
      if (!grabIcon) {
        grabIcon = document.createElement('i');
        grabIcon.className = 'fas fa-hand-pointer physics-grab-icon';
        grabIcon.setAttribute('aria-hidden','true');
        grabIcon.style.display = 'none';
        modeButton.appendChild(grabIcon);
      }
    }

    function simulationRunning() {
      return !!physics.state?.enabled && !!box.running;
    }

    function physicsOwnsCanvas() {
      return simulationRunning() && interactionMode === 'grab';
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

    function syncModeButton() {
      if (!modeButton) return;
      const arrows = modeButton.querySelector('.orbit-arrows');
      const cube = modeButton.querySelector('.orbit-iso-cube');
      const running = simulationRunning();

      if (running) {
        modeButton.classList.remove('is-edit');
        modeButton.classList.toggle('is-physics-orbit', interactionMode === 'orbit');
        modeButton.classList.toggle('is-physics-grab', interactionMode === 'grab');
        modeButton.dataset.mode = interactionMode === 'orbit' ? 'physics-orbit' : 'physics-grab';
        modeButton.setAttribute('aria-pressed', interactionMode === 'orbit' ? 'false' : 'true');
        if (arrows) arrows.style.display = interactionMode === 'orbit' ? 'inline-block' : 'none';
        if (cube) cube.style.display = 'none';
        if (grabIcon) grabIcon.style.display = interactionMode === 'grab' ? 'inline-block' : 'none';
        const label = interactionMode === 'grab'
          ? 'Physics grab. Tap for Orbit while physics keeps running.'
          : 'Orbit while physics runs. Tap to return to Physics grab.';
        modeButton.title = label;
        modeButton.setAttribute('aria-label', label);
        return;
      }

      modeButton.classList.remove('is-physics-orbit','is-physics-grab');
      if (grabIcon) grabIcon.style.display = 'none';
      const edit = app.mobileCanvasMode === 'edit';
      modeButton.dataset.mode = edit ? 'edit' : 'view';
      modeButton.classList.toggle('is-edit', edit);
      modeButton.setAttribute('aria-pressed', edit ? 'true' : 'false');
      if (arrows) arrows.style.display = edit ? 'none' : 'inline-block';
      if (cube) cube.style.display = edit ? 'block' : 'none';
      modeButton.title = edit ? 'Draw / erase / paint' : 'Move viewport';
      modeButton.setAttribute('aria-label', modeButton.title);
    }

    function cancelDrag(pointerId) {
      const drag = drags.get(pointerId);
      if (!drag) return false;
      box.endMouseGrab?.(drag.slot);
      drags.delete(pointerId);
      if (slotPointers[drag.slot] === pointerId) slotPointers[drag.slot] = null;
      canvas.style.cursor = physicsOwnsCanvas() ? (drags.size ? 'grabbing' : 'grab') : previousCursor;
      return true;
    }

    function cancelAllDrags() {
      for (const pointerId of [...drags.keys()]) cancelDrag(pointerId);
      box.endAllMouseGrabs?.();
      slotPointers.fill(null);
      canvas.style.cursor = physicsOwnsCanvas() ? 'grab' : previousCursor;
    }

    function setInteractionMode(next) {
      const mode = next === 'orbit' ? 'orbit' : 'grab';
      if (interactionMode === mode) {
        syncModeButton();
        return interactionMode;
      }
      if (mode === 'orbit') {
        cancelAllDrags();
        app.mobileCanvasMode = 'view';
        try { app.updateMobileCanvasModeUI?.(); } catch (_) {}
      }
      interactionMode = mode;
      canvas.style.touchAction = simulationRunning() ? 'none' : previousTouchAction;
      canvas.style.cursor = physicsOwnsCanvas() ? 'grab' : previousCursor;
      syncModeButton();
      return interactionMode;
    }

    function toggleInteractionMode() {
      return setInteractionMode(interactionMode === 'grab' ? 'orbit' : 'grab');
    }

    function onModeButtonClick(event) {
      if (!simulationRunning()) return;
      consume(event);
      toggleInteractionMode();
    }

    function onPointerDown(event) {
      if (!physicsOwnsCanvas() || !eventIsOnCanvas(event)) return;
      consume(event);

      // Physics-grab owns every pointer while active. Non-primary touch pointers
      // are intentionally accepted so two fingers can drive two native Box3D grabs.
      if (event.button > 0 || drags.has(event.pointerId)) return;
      const slot = freeSlot();
      if (slot < 0) return;

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

    modeButton?.addEventListener('click', onModeButtonClick, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerEnd, true);
    window.addEventListener('pointercancel', onPointerEnd, true);
    ['mousedown','mousemove','mouseup','contextmenu','wheel'].forEach((name) => {
      window.addEventListener(name, blockLegacyMouse, { capture:true, passive:false });
    });

    const sync = () => {
      const running = simulationRunning();
      if (running && !wasRunning) {
        savedCanvasMode = app.mobileCanvasMode || 'view';
        interactionMode = 'grab';
        app.mobileCanvasMode = 'view';
        try { app.updateMobileCanvasModeUI?.(); } catch (_) {}
      } else if (!running && wasRunning) {
        if (drags.size) cancelAllDrags();
        interactionMode = 'grab';
        if (savedCanvasMode) {
          app.mobileCanvasMode = savedCanvasMode;
          try { app.updateMobileCanvasModeUI?.(); } catch (_) {}
        }
        savedCanvasMode = null;
      }
      wasRunning = running;

      if (running) {
        canvas.style.touchAction = 'none';
        canvas.style.cursor = physicsOwnsCanvas() ? (drags.size ? 'grabbing' : 'grab') : previousCursor;
      } else {
        if (drags.size) cancelAllDrags();
        canvas.style.touchAction = previousTouchAction;
        canvas.style.cursor = previousCursor;
      }
      syncModeButton();
    };
    const timer = setInterval(sync, 60);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });

    window.VoxelPhysicsInputRouter = {
      installed:true,
      maxPointerGrabs:MAX_POINTER_GRABS,
      get mode() {
        if (simulationRunning()) return interactionMode === 'orbit' ? 'physics-orbit' : 'physics';
        if (app.mobileCanvasMode === 'edit') return 'edit';
        return 'orbit';
      },
      get physicsInputMode(){ return interactionMode; },
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
      setInteractionMode,
      toggleInteractionMode,
      cancelDrag,
      cancelAllDrags
    };
    sync();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 60);
  install();
})();
