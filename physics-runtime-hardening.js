(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    const box = window.VoxelBox3D;
    if (!app || !physics || !box?.installed) return false;
    if (box.hardened) return true;

    const rawStart = box.start.bind(box);
    const rawStop = box.stop.bind(box);
    let startPromise = null;
    let generation = 0;
    let lastError = null;
    let lastTransition = 'idle';

    const voxelKey = (seed) => {
      if (!Array.isArray(seed) || seed.length < 3) return null;
      return app.key(Math.round(seed[0]), Math.round(seed[1]), Math.round(seed[2]));
    };

    const connectedBody = (seed) => {
      const key = voxelKey(seed);
      if (key == null || !app.voxels?.has(key)) return new Set();
      return app.getConnectedGroup?.(key) || new Set([key]);
    };

    const activeJoint = () => physics.state?.joints?.find((j) => j.id === physics.state?.active) || null;

    function preflight() {
      if (!physics.state?.enabled) throw new Error('Physics mode is not active');
      const joint = activeJoint();
      if (!joint) throw new Error('No physics joint selected');
      const moving = connectedBody(joint.movingSeed);
      if (!moving.size) throw new Error('Moving body is missing');
      if (joint.baseSeed) {
        const baseKey = voxelKey(joint.baseSeed);
        const base = connectedBody(joint.baseSeed);
        if (!base.size) throw new Error('Base body is missing');
        if (baseKey != null && moving.has(baseKey)) {
          throw new Error('Base A and Moving B are the same connected body');
        }
      }
      return joint;
    }

    function reportError(err) {
      lastError = err?.message || String(err);
      lastTransition = 'error';
      physics.state.running = false;
      console.error('[VoxelShaper][Box3D]', lastError);
      try { app.showToast?.('Physics', lastError, 'error', 2200); } catch (_) {}
    }

    async function start() {
      if (box.running) return true;
      if (startPromise) return startPromise;
      const myGeneration = ++generation;
      let joint;
      try {
        joint = preflight();
      } catch (err) {
        reportError(err);
        return false;
      }

      lastError = null;
      lastTransition = 'starting';
      startPromise = (async () => {
        try {
          const ok = await rawStart();
          if (myGeneration !== generation) {
            rawStop();
            lastTransition = 'stopped';
            return false;
          }
          if (!ok || !box.running) throw new Error('Box3D did not enter running state');
          lastTransition = 'running';
          console.info('[VoxelShaper][Box3D] running', {
            joint: joint.id,
            type: joint.type,
            motor: !!joint.motor?.enabled
          });
          return true;
        } catch (err) {
          rawStop();
          reportError(err);
          return false;
        } finally {
          startPromise = null;
        }
      })();
      return startPromise;
    }

    function stop() {
      generation += 1;
      lastTransition = 'stopping';
      try {
        rawStop();
      } catch (err) {
        reportError(err);
        return false;
      }
      physics.state.running = false;
      lastTransition = 'stopped';
      console.info('[VoxelShaper][Box3D] stopped');
      return true;
    }

    box.start = start;
    box.stop = stop;
    box.toggle = () => (box.running || physics.state?.running ? Promise.resolve(stop()) : start());
    box.preflight = preflight;
    box.getStatus = () => ({
      running: !!box.running,
      starting: !!startPromise,
      transition: lastTransition,
      lastError,
      activeJoint: physics.state?.active || null
    });
    box.hardened = true;

    const originalDisable = physics.disable;
    physics.disable = function () {
      stop();
      return originalDisable?.();
    };

    const originalNewJoint = physics.newJoint;
    physics.newJoint = function () {
      if (box.running || physics.state?.running) stop();
      return originalNewJoint?.();
    };

    let mobileBusy = false;
    document.addEventListener('click', async (event) => {
      const button = event.target?.closest?.('#vs-physics-test');
      if (!button || !physics.state?.enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mobileBusy) return;

      if (box.running || physics.state?.running) {
        stop();
        return;
      }

      mobileBusy = true;
      button.disabled = true;
      try {
        await start();
      } finally {
        mobileBusy = false;
        button.disabled = false;
      }
    }, true);

    return true;
  }

  const timer = window.setInterval(() => {
    if (install()) window.clearInterval(timer);
  }, 80);
  window.setTimeout(() => {
    window.clearInterval(timer);
    install();
  }, 10000);
})();
