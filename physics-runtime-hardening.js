(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const box = window.VoxelBox3D;
    if (!app || !physics?.simpleMode || !box?.installed || !box?.simpleMode) return false;
    if (box.hardened) return true;

    const rawStart = box.start.bind(box);
    const rawStop = box.stop.bind(box);
    let startPromise = null;
    let generation = 0;
    let desiredRunning = false;
    let lastError = null;
    let transition = 'stopped';

    function syncUi() {
      const starting = transition === 'starting';
      const on = !!box.running;
      const requested = desiredRunning || starting || on;
      const button = document.getElementById('vs-physics-test');
      if (button) {
        button.disabled = false;
        button.style.display = 'flex';
        button.dataset.physicsState = starting ? 'starting' : on ? 'running' : 'stopped';
        button.setAttribute('aria-pressed', requested ? 'true' : 'false');
        button.setAttribute('aria-label', starting ? 'Cancel physics start' : on ? 'Stop physics and reset' : 'Play physics');
        const icon = button.querySelector('i');
        if (icon) icon.className = starting ? 'fas fa-spinner fa-spin' : on ? 'fas fa-stop' : 'fas fa-play';
      }
      physics.state.running = on;
      physics.syncUi?.();
    }

    function preflight() {
      if (!app.voxels?.size) throw new Error('Model has no voxels');
      return true;
    }

    function reportError(error) {
      desiredRunning = false;
      lastError = error?.message || String(error);
      transition = 'error';
      physics.state.running = false;
      physics.state.enabled = false;
      syncUi();
      console.error('[VoxelShaper][Box3D]', lastError);
      try { app.showToast?.('Physics', lastError, 'error', 1800); } catch (_) {}
    }

    async function start() {
      desiredRunning = true;
      physics.state.enabled = true; // Physics owns input from this point until Stop.

      if (box.running) {
        transition = 'running';
        syncUi();
        return true;
      }
      if (startPromise) {
        syncUi();
        return startPromise;
      }

      try { preflight(); } catch (error) { reportError(error); return false; }
      const myGeneration = ++generation;
      lastError = null;
      transition = 'starting';
      syncUi();

      startPromise = (async () => {
        try {
          const ok = await rawStart();
          if (myGeneration !== generation || !desiredRunning) {
            rawStop();
            physics.state.enabled = false;
            transition = 'stopped';
            syncUi();
            return false;
          }
          if (!ok || !box.running) throw new Error('Box3D did not enter running state');
          transition = 'running';
          syncUi();
          console.info('[VoxelShaper][Box3D] simple physics running', { bodies: box.bodyCount });
          return true;
        } catch (error) {
          try { rawStop(); } catch (_) {}
          reportError(error);
          return false;
        } finally {
          startPromise = null;
          syncUi();
        }
      })();
      return startPromise;
    }

    function stop() {
      desiredRunning = false;
      generation += 1;
      transition = 'stopping';
      syncUi();
      try {
        rawStop(); // destroys Box3D world + restores original authoring render
      } catch (error) {
        reportError(error);
        return false;
      }
      physics.state.running = false;
      physics.state.preview = null;
      physics.state.enabled = false; // Return input ownership to Orbit/Edit.
      transition = 'stopped';
      syncUi();
      console.info('[VoxelShaper][Box3D] simple physics reset');
      return true;
    }

    function toggle() {
      const wantsStop = desiredRunning || !!startPromise || box.running || physics.state?.running;
      return wantsStop ? Promise.resolve(stop()) : start();
    }

    box.start = start;
    box.stop = stop;
    box.reset = stop;
    box.toggle = toggle;
    box.syncUi = syncUi;
    box.getStatus = () => ({
      running: !!box.running,
      starting: !!startPromise,
      desiredRunning,
      transition,
      lastError,
      bodies: box.bodyCount || 0
    });
    box.hardened = true;

    // Keep history deterministic: simulation is temporary and resets before edits.
    ['undo','redo'].forEach((name) => {
      if (typeof app[name] !== 'function' || app[`__physicsSimpleWrapped_${name}`]) return;
      app[`__physicsSimpleWrapped_${name}`] = true;
      const original = app[name];
      app[name] = function (...args) {
        if (desiredRunning || startPromise || box.running || physics.state?.running) stop();
        return original.apply(this, args);
      };
    });

    // Play is the only public Physics lifecycle control on mobile and desktop.
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('#vs-physics-test');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle().catch(reportError);
    }, true);

    syncUi();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
