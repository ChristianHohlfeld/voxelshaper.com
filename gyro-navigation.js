(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const MAX_YAW = 85 * DEG;
  const MAX_PITCH_DELTA = 60 * DEG;
  const MIN_ORBIT_PITCH = -82 * DEG;
  const MAX_ORBIT_PITCH = 82 * DEG;
  const SMOOTH_HZ = 11;
  const DEAD_ANGLE = 0.12 * DEG;

  function install() {
    const app = window.VoxelApp;
    if (!app?.cam || !app?.cvs || typeof THREE === 'undefined') return false;
    if (window.VoxelGyroNavigation?.installed) return true;

    const state = {
      installed: true,
      enabled: false,
      permission: 'unknown',
      calibrated: false,
      lastSampleAt: 0,
      sampleCount: 0,
      screenAngle: 0,
      pausedByTouch: false,
      needsRecenter: true,
      targetYaw: 0,
      targetPitch: 0,
      currentYaw: 0,
      currentPitch: 0,
      radius: 1,
      lastFrame: 0,
      lastError: null
    };

    const deviceQ = new THREE.Quaternion();
    const referenceQ = new THREE.Quaternion();
    const inverseReferenceQ = new THREE.Quaternion();
    const deltaQ = new THREE.Quaternion();
    const targetQ = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const zee = new THREE.Vector3(0, 0, 1);
    const qScreen = new THREE.Quaternion();
    // DeviceOrientation coordinates describe a device whose +Z points out of the screen.
    // Three's camera looks down -Z, so rotate the device frame by -90deg around X.
    const qDeviceToCamera = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
    const offset = new THREE.Vector3();
    let latestQ = null;
    let raf = 0;

    function isMobileSurface() {
      return !!(app.isMobile || matchMedia?.('(pointer: coarse)')?.matches || innerWidth < 900);
    }

    function getScreenAngle() {
      const raw = Number(screen.orientation?.angle);
      if (Number.isFinite(raw)) return raw * DEG;
      const legacy = Number(window.orientation);
      return Number.isFinite(legacy) ? legacy * DEG : 0;
    }

    function orientationQuaternion(alpha, beta, gamma, screenAngle = getScreenAngle()) {
      if (![alpha, beta, gamma].every(Number.isFinite)) return null;
      euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
      deviceQ.setFromEuler(euler);
      deviceQ.multiply(qDeviceToCamera);
      qScreen.setFromAxisAngle(zee, -screenAngle);
      deviceQ.multiply(qScreen);
      deviceQ.normalize();
      return deviceQ;
    }

    function orbitStateFromCamera() {
      const target = app.ensureOrbitTarget?.() || app.orbitTarget || new THREE.Vector3((app.GRID || 32) * (app.VS || 1) * .5, 0, (app.GRID || 32) * (app.VS || 1) * .5);
      offset.copy(app.cam.position).sub(target);
      const radius = Math.max(.001, offset.length());
      const horizontal = Math.max(.0001, Math.hypot(offset.x, offset.z));
      return {
        target,
        radius,
        yaw: Math.atan2(offset.x, offset.z),
        pitch: Math.atan2(offset.y, horizontal)
      };
    }

    function applyOrbit(yaw, pitch, radius) {
      const orbit = app.ensureOrbitTarget?.() || app.orbitTarget;
      if (!orbit) return;
      const cp = Math.cos(pitch);
      app.cam.position.set(
        orbit.x + Math.sin(yaw) * cp * radius,
        orbit.y + Math.sin(pitch) * radius,
        orbit.z + Math.cos(yaw) * cp * radius
      );
      app.cam.lookAt(orbit);
      app.syncEulerFromCamera?.();
      app.updateDynamicGlow?.();
    }

    function calibrateFrom(q) {
      if (!q) return false;
      referenceQ.copy(q);
      inverseReferenceQ.copy(referenceQ).invert();
      const orbit = orbitStateFromCamera();
      state.radius = orbit.radius;
      state.currentYaw = state.targetYaw = orbit.yaw;
      state.currentPitch = state.targetPitch = orbit.pitch;
      state.screenAngle = getScreenAngle();
      state.calibrated = true;
      state.needsRecenter = false;
      return true;
    }

    function shouldDriveCamera() {
      if (!state.enabled || !state.calibrated || state.pausedByTouch) return false;
      if (!isMobileSurface()) return false;
      // Physics uses the same hardware movement as force input. Do not make the camera
      // fight the simulation while the Physics sandbox is active.
      if (window.VoxelPhysics?.state?.enabled) return false;
      return (app.mobileCanvasMode || 'view') === 'view';
    }

    function onOrientation(event) {
      const alpha = Number(event.alpha);
      const beta = Number(event.beta);
      const gamma = Number(event.gamma);
      const q = orientationQuaternion(alpha, beta, gamma);
      if (!q) return;
      latestQ = q.clone();
      state.lastSampleAt = performance.now();
      state.sampleCount += 1;

      if (!state.enabled) return;
      if (state.needsRecenter || !state.calibrated || Math.abs(getScreenAngle() - state.screenAngle) > .001) {
        calibrateFrom(q);
        return;
      }
      if (!shouldDriveCamera()) return;

      // q_delta is expressed relative to the calibrated phone pose, so alpha wrap at
      // 0/360 and arbitrary browser heading origins cannot cause a camera jump.
      deltaQ.copy(inverseReferenceQ).multiply(q).normalize();
      euler.setFromQuaternion(deltaQ, 'YXZ');
      let yawDelta = THREE.MathUtils.clamp(euler.y, -MAX_YAW, MAX_YAW);
      let pitchDelta = THREE.MathUtils.clamp(euler.x, -MAX_PITCH_DELTA, MAX_PITCH_DELTA);
      if (Math.abs(yawDelta) < DEAD_ANGLE) yawDelta = 0;
      if (Math.abs(pitchDelta) < DEAD_ANGLE) pitchDelta = 0;

      const orbit = orbitStateFromCamera();
      // Keep distance changes from pinch zoom, but use the calibrated angular origin.
      state.radius = orbit.radius;
      const baseYaw = state.currentYaw - (state.currentYaw - state.targetYaw);
      const basePitch = state.currentPitch - (state.currentPitch - state.targetPitch);
      // reference camera angles are captured by calibrateFrom. Store them lazily on state.
      if (!Number.isFinite(state.baseYaw)) state.baseYaw = state.targetYaw;
      if (!Number.isFinite(state.basePitch)) state.basePitch = state.targetPitch;
      state.targetYaw = state.baseYaw - yawDelta;
      state.targetPitch = THREE.MathUtils.clamp(state.basePitch + pitchDelta, MIN_ORBIT_PITCH, MAX_ORBIT_PITCH);
    }

    function frame(now) {
      const dt = state.lastFrame ? Math.min(.05, (now - state.lastFrame) / 1000) : 1 / 60;
      state.lastFrame = now;
      if (shouldDriveCamera()) {
        const blend = 1 - Math.exp(-SMOOTH_HZ * dt);
        const yawError = Math.atan2(Math.sin(state.targetYaw - state.currentYaw), Math.cos(state.targetYaw - state.currentYaw));
        state.currentYaw += yawError * blend;
        state.currentPitch += (state.targetPitch - state.currentPitch) * blend;
        applyOrbit(state.currentYaw, state.currentPitch, state.radius);
      }
      raf = requestAnimationFrame(frame);
    }

    function recenter() {
      state.baseYaw = NaN;
      state.basePitch = NaN;
      state.needsRecenter = true;
      if (latestQ) {
        calibrateFrom(latestQ);
        state.baseYaw = state.targetYaw;
        state.basePitch = state.targetPitch;
      }
      return true;
    }

    async function requestPermissionFromGesture() {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const result = await DeviceOrientationEvent.requestPermission(false);
          state.permission = result;
          return result === 'granted';
        }
        state.permission = typeof DeviceOrientationEvent !== 'undefined' ? 'granted' : 'unsupported';
        return state.permission === 'granted';
      } catch (error) {
        state.lastError = error?.message || String(error);
        state.permission = 'denied';
        return false;
      }
    }

    async function enableFromGesture() {
      const allowed = await requestPermissionFromGesture();
      if (!allowed) {
        app.showToast?.('Gyro', state.permission === 'unsupported' ? 'Orientation sensor unavailable' : 'Motion access not granted', 'info', 1400);
        return false;
      }
      state.enabled = true;
      recenter();
      app.showToast?.('Gyro', 'Camera motion on · tap camera to recenter', 'success', 1100);
      syncButton();
      return true;
    }

    function enableWithoutPrompt() {
      state.permission = 'granted';
      state.enabled = true;
      recenter();
      syncButton();
      return true;
    }

    function disable() {
      state.enabled = false;
      state.calibrated = false;
      state.needsRecenter = true;
      app.syncEulerFromCamera?.();
      syncButton();
      return true;
    }

    function syncButton() {
      const button = document.getElementById('mobile-camera');
      if (!button) return;
      button.dataset.gyro = state.enabled ? 'on' : 'off';
      button.setAttribute('aria-label', state.enabled ? 'Recenter gyro camera' : 'Enable gyro camera');
      button.title = state.enabled ? 'Recenter gyro camera' : 'Enable gyro camera';
    }

    // The existing camera button still runs its normal reset handler. We additionally
    // make that same explicit tap the permission/recenter gesture, avoiding surprise prompts.
    const cameraButton = document.getElementById('mobile-camera');
    cameraButton?.addEventListener('click', () => {
      if (!state.enabled) enableFromGesture();
      else requestAnimationFrame(recenter);
    }, true);

    // Manual touch orbit always wins. On release we rebase the sensor onto the user's
    // new camera angle, so touch and gyro never fight or snap back.
    app.cvs.addEventListener('pointerdown', (event) => {
      if (!state.enabled || event.pointerType === 'mouse') return;
      state.pausedByTouch = true;
    }, true);
    const endTouch = (event) => {
      if (!state.enabled || event.pointerType === 'mouse') return;
      state.pausedByTouch = false;
      state.needsRecenter = true;
    };
    app.cvs.addEventListener('pointerup', endTouch, true);
    app.cvs.addEventListener('pointercancel', endTouch, true);

    const orientationChanged = () => {
      state.screenAngle = getScreenAngle();
      state.needsRecenter = true;
    };
    window.addEventListener('orientationchange', orientationChanged, { passive: true });
    screen.orientation?.addEventListener?.('change', orientationChanged);
    window.addEventListener('deviceorientation', onOrientation, { passive: true });

    window.VoxelGyroNavigation = {
      installed: true,
      state,
      enableFromGesture,
      enableWithoutPrompt,
      disable,
      recenter,
      // Deterministic test hook using the exact production transform path.
      feed(alpha, beta, gamma, angleDeg = null) {
        const q = orientationQuaternion(Number(alpha), Number(beta), Number(gamma), angleDeg == null ? getScreenAngle() : Number(angleDeg) * DEG);
        if (!q) return false;
        latestQ = q.clone();
        if (state.needsRecenter || !state.calibrated) {
          calibrateFrom(q);
          state.baseYaw = state.targetYaw;
          state.basePitch = state.targetPitch;
        } else {
          deltaQ.copy(inverseReferenceQ).multiply(q).normalize();
          euler.setFromQuaternion(deltaQ, 'YXZ');
          let yawDelta = THREE.MathUtils.clamp(euler.y, -MAX_YAW, MAX_YAW);
          let pitchDelta = THREE.MathUtils.clamp(euler.x, -MAX_PITCH_DELTA, MAX_PITCH_DELTA);
          if (Math.abs(yawDelta) < DEAD_ANGLE) yawDelta = 0;
          if (Math.abs(pitchDelta) < DEAD_ANGLE) pitchDelta = 0;
          state.targetYaw = state.baseYaw - yawDelta;
          state.targetPitch = THREE.MathUtils.clamp(state.basePitch + pitchDelta, MIN_ORBIT_PITCH, MAX_ORBIT_PITCH);
        }
        return true;
      }
    };

    syncButton();
    raf = requestAnimationFrame(frame);
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
