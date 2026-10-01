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
    let desiredRunning = false;
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

    function syncUi() {
      const starting = lastTransition === 'starting';
      const on = !!box.running;
      const requested = desiredRunning || starting || on;
      const legacyIcon = document.getElementById('vsp-playicon');
      const legacyText = document.getElementById('vsp-playtext');
      const mobileButton = document.getElementById('vs-physics-test');
      const mobileIcon = mobileButton?.querySelector('i');

      if (legacyIcon) legacyIcon.className = starting ? 'fas fa-spinner fa-spin' : on ? 'fas fa-stop' : 'fas fa-play';
      if (legacyText) legacyText.textContent = starting ? 'Starting…' : on ? 'Stop test' : 'Test joint';
      if (mobileIcon) mobileIcon.className = starting ? 'fas fa-spinner fa-spin' : on ? 'fas fa-stop' : 'fas fa-play';
      if (mobileButton) {
        mobileButton.disabled = false;
        mobileButton.dataset.physicsState = starting ? 'starting' : on ? 'running' : 'stopped';
        mobileButton.setAttribute('aria-pressed', requested ? 'true' : 'false');
        mobileButton.setAttribute('aria-label', starting ? 'Cancel physics test' : on ? 'Stop physics test' : 'Play physics test');
      }
    }

    function preflight() {
      if (!physics.state?.enabled) throw new Error('Physics mode is not active');
      const joint = activeJoint();
      if (!joint) throw new Error('No physics joint selected');
      if (!['hinge', 'slider', 'fixed'].includes(joint.type)) throw new Error(`Unsupported joint type: ${joint.type}`);

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

      if (joint.type !== 'fixed') {
        const axis = Array.isArray(joint.axis) ? joint.axis : [];
        const axisLength2 = axis.length >= 3 ? Number(axis[0]) ** 2 + Number(axis[1]) ** 2 + Number(axis[2]) ** 2 : 0;
        if (!Number.isFinite(axisLength2) || axisLength2 < 0.25) throw new Error('Joint axis is invalid');
      }

      if (joint.limits?.enabled) {
        const lo = Number(joint.limits.min);
        const hi = Number(joint.limits.max);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new Error('Joint limits are invalid');
        if (joint.type === 'hinge') {
          // Box3D main @ 9f998c8: revolute limits are bounded to +/-0.99*pi and should include zero.
          const maxDegrees = 0.99 * 180;
          if (lo < -maxDegrees || hi > maxDegrees) throw new Error('Hinge limits must stay within ±178.2° for Box3D');
          if (lo > 0 || hi < 0) throw new Error('Hinge limits must include 0° for a stable Box3D start');
        }
      }

      if (joint.motor?.enabled) {
        const speed = Number(joint.motor.speed);
        const strength = Number(joint.motor.strength);
        if (!Number.isFinite(speed)) throw new Error('Motor speed is invalid');
        if (!Number.isFinite(strength) || strength < 0) throw new Error('Motor strength must be non-negative');
      }
      return joint;
    }

    function reportError(err) {
      desiredRunning = false;
      lastError = err?.message || String(err);
      lastTransition = 'error';
      physics.state.running = false;
      syncUi();
      console.error('[VoxelShaper][Box3D]', lastError);
      try { app.showToast?.('Physics', lastError, 'error', 2200); } catch (_) {}
    }

    async function start() {
      desiredRunning = true;
      if (box.running) {
        lastTransition = 'running';
        syncUi();
        return true;
      }
      if (startPromise) {
        syncUi();
        return startPromise;
      }

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
      syncUi();
      startPromise = (async () => {
        try {
          const ok = await rawStart();
          if (myGeneration !== generation || !desiredRunning) {
            rawStop();
            physics.state.running = false;
            lastTransition = 'stopped';
            syncUi();
            return false;
          }
          if (!ok || !box.running) throw new Error('Box3D did not enter running state');
          lastTransition = 'running';
          syncUi();
          console.info('[VoxelShaper][Box3D] running', {
            joint: joint.id,
            type: joint.type,
            motor: !!joint.motor?.enabled
          });
          return true;
        } catch (err) {
          try { rawStop(); } catch (_) {}
          reportError(err);
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
      lastTransition = 'stopping';
      syncUi();
      try {
        rawStop();
      } catch (err) {
        reportError(err);
        return false;
      }
      physics.state.running = false;
      lastTransition = 'stopped';
      syncUi();
      console.info('[VoxelShaper][Box3D] stopped');
      return true;
    }

    function toggle() {
      const wantsStop = desiredRunning || !!startPromise || box.running || physics.state?.running;
      return wantsStop ? Promise.resolve(stop()) : start();
    }

    box.start = start;
    box.stop = stop;
    box.toggle = toggle;
    box.preflight = preflight;
    box.syncUi = syncUi;
    box.getStatus = () => ({
      running: !!box.running,
      starting: !!startPromise,
      desiredRunning,
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
      if (desiredRunning || startPromise || box.running || physics.state?.running) stop();
      return originalNewJoint?.();
    };

    // Single authoritative UI path for both the legacy desktop button and the mobile toolbar.
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('#vs-physics-test, #vsp-play');
      if (!button || !physics.state?.enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle().catch(reportError);
    }, true);

    syncUi();
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
