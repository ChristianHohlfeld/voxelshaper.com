(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const MAX_YAW = 100 * DEG;
  const MAX_PITCH_DELTA = 65 * DEG;
  const MIN_ORBIT_PITCH = -82 * DEG;
  const MAX_ORBIT_PITCH = 82 * DEG;
  const SMOOTH_HZ = 9;
  const DEAD_ANGLE = 0.35 * DEG;
  const SENSOR_STALE_MS = 900;

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
      driveActive: false,
      targetYaw: 0,
      targetPitch: 0,
      currentYaw: 0,
      currentPitch: 0,
      baseYaw: NaN,
      basePitch: NaN,
      radius: 1,
      lastFrame: 0,
      lastError: null
    };

    const deviceQ = new THREE.Quaternion();
    const referenceQ = new THREE.Quaternion();
    const inverseReferenceQ = new THREE.Quaternion();
    const deltaQ = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const zee = new THREE.Vector3(0, 0, 1);
    const qScreen = new THREE.Quaternion();
    const qDeviceToCamera = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
    const offset = new THREE.Vector3();
    const relativeForward = new THREE.Vector3();
    let latestQ = null;
    let raf = 0;

    function isMobileSurface() {
      return !!(app.isMobile || window.matchMedia?.('(pointer: coarse)')?.matches || innerWidth < 900);
    }

    function wrapAngle(a) {
      return Math.atan2(Math.sin(a), Math.cos(a));
    }

    function getScreenAngle() {
      const raw = Number(screen.orientation?.angle);
      const deg = Number.isFinite(raw) ? raw : (Number.isFinite(Number(window.orientation)) ? Number(window.orientation) : 0);
      return wrapAngle(deg * DEG);
    }

    function orientationQuaternion(alpha, beta, gamma, screenAngle = getScreenAngle()) {
      if (![alpha, beta, gamma].every(Number.isFinite)) return null;
      // W3C DeviceOrientation uses intrinsic Z-X'-Y'' rotations. The YXZ Euler
      // construction below is the established Three.js DeviceOrientation mapping;
      // qDeviceToCamera makes the phone frame match a camera looking down -Z and
      // qScreen compensates portrait/landscape rotation separately.
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
      state.baseYaw = orbit.yaw;
      state.basePitch = orbit.pitch;
      state.currentYaw = state.targetYaw = orbit.yaw;
      state.currentPitch = state.targetPitch = orbit.pitch;
      state.screenAngle = getScreenAngle();
      state.calibrated = true;
      state.needsRecenter = false;
      return true;
    }

    function relativeAnglesFrom(q) {
      // Relative forward direction avoids Euler-axis coupling at tilted poses and
      // naturally ignores pure phone roll.
      deltaQ.copy(inverseReferenceQ).multiply(q).normalize();
      relativeForward.set(0, 0, -1).applyQuaternion(deltaQ).normalize();
      const yaw = Math.atan2(relativeForward.x, -relativeForward.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(relativeForward.y, -1, 1));
      return { yaw, pitch };
    }

    function canOwnCamera() {
      if (!state.enabled || state.pausedByTouch) return false;
      if (!isMobileSurface()) return false;
      if (window.VoxelPhysics?.state?.enabled) return false;
      return (app.mobileCanvasMode || 'view') === 'view';
    }

    function shouldDriveCamera() {
      if (!canOwnCamera() || !state.calibrated || state.needsRecenter) return false;
      return performance.now() - state.lastSampleAt <= SENSOR_STALE_MS;
    }

    function consumeQuaternion(q) {
      if (!q) return false;
      const now = performance.now();
      const wasStale = state.lastSampleAt > 0 && now - state.lastSampleAt > SENSOR_STALE_MS;
      latestQ = q.clone();
      state.lastSampleAt = now;
      state.sampleCount += 1;

      if (!state.enabled) return true;

      // Edit mode, Physics mode and touch gestures temporarily own navigation.
      // Any movement that happens there must not be replayed when Orbit resumes.
      if (!canOwnCamera()) {
        state.driveActive = false;
        state.needsRecenter = true;
        return true;
      }

      if (!state.driveActive) {
        state.driveActive = true;
        state.needsRecenter = true;
      }
      if (wasStale) state.needsRecenter = true;

      const currentScreen = getScreenAngle();
      if (state.needsRecenter || !state.calibrated || Math.abs(wrapAngle(currentScreen - state.screenAngle)) > .001) {
        calibrateFrom(q);
        return true;
      }

      const relative = relativeAnglesFrom(q);
      let yawDelta = THREE.MathUtils.clamp(relative.yaw, -MAX_YAW, MAX_YAW);
      let pitchDelta = THREE.MathUtils.clamp(relative.pitch, -MAX_PITCH_DELTA, MAX_PITCH_DELTA);
      if (Math.abs(yawDelta) < DEAD_ANGLE) yawDelta = 0;
      if (Math.abs(pitchDelta) < DEAD_ANGLE) pitchDelta = 0;

      const orbit = orbitStateFromCamera();
      state.radius = orbit.radius;
      state.targetYaw = wrapAngle(state.baseYaw - yawDelta);
      state.targetPitch = THREE.MathUtils.clamp(state.basePitch + pitchDelta, MIN_ORBIT_PITCH, MAX_ORBIT_PITCH);
      return true;
    }

    function onOrientation(event) {
      if (event.alpha == null || event.beta == null || event.gamma == null) return;
      const q = orientationQuaternion(Number(event.alpha), Number(event.beta), Number(event.gamma));
      consumeQuaternion(q);
    }

    function frame(now) {
      const dt = state.lastFrame ? Math.min(.05, Math.max(0, (now - state.lastFrame) / 1000)) : 1 / 60;
      state.lastFrame = now;
      if (shouldDriveCamera()) {
        const blend = 1 - Math.exp(-SMOOTH_HZ * dt);
        const yawError = wrapAngle(state.targetYaw - state.currentYaw);
        state.currentYaw = wrapAngle(state.currentYaw + yawError * blend);
        state.currentPitch += (state.targetPitch - state.currentPitch) * blend;
        applyOrbit(state.currentYaw, state.currentPitch, state.radius);
      }
      raf = requestAnimationFrame(frame);
    }

    function recenter() {
      state.baseYaw = NaN;
      state.basePitch = NaN;
      state.needsRecenter = true;
      state.driveActive = false;
      if (latestQ && canOwnCamera()) {
        calibrateFrom(latestQ);
        state.driveActive = true;
      }
      return true;
    }

    async function requestPermissionFromGesture() {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          // Relative orientation only; do not request magnetometer/absolute heading.
          const result = await DeviceOrientationEvent.requestPermission();
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
      state.driveActive = false;
      recenter();
      app.showToast?.('Gyro', 'Camera motion on · tap camera to recenter', 'success', 1100);
      syncButton();
      return true;
    }

    function enableWithoutPrompt() {
      state.permission = 'granted';
      state.enabled = true;
      state.driveActive = false;
      recenter();
      syncButton();
      return true;
    }

    function disable() {
      state.enabled = false;
      state.calibrated = false;
      state.needsRecenter = true;
      state.driveActive = false;
      state.baseYaw = NaN;
      state.basePitch = NaN;
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

    const cameraButton = document.getElementById('mobile-camera');
    cameraButton?.addEventListener('click', () => {
      if (!state.enabled) enableFromGesture();
      else requestAnimationFrame(recenter);
    }, true);

    // Manual touch orbit always wins. Rebase onto the resulting camera pose on release.
    app.cvs.addEventListener('pointerdown', (event) => {
      if (!state.enabled || event.pointerType === 'mouse') return;
      state.pausedByTouch = true;
      state.driveActive = false;
    }, true);
    const endTouch = (event) => {
      if (!state.enabled || event.pointerType === 'mouse') return;
      state.pausedByTouch = false;
      state.needsRecenter = true;
      state.driveActive = false;
    };
    app.cvs.addEventListener('pointerup', endTouch, true);
    app.cvs.addEventListener('pointercancel', endTouch, true);

    const orientationChanged = () => {
      state.screenAngle = getScreenAngle();
      state.needsRecenter = true;
      state.driveActive = false;
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
      feed(alpha, beta, gamma, angleDeg = null) {
        const q = orientationQuaternion(Number(alpha), Number(beta), Number(gamma), angleDeg == null ? getScreenAngle() : wrapAngle(Number(angleDeg) * DEG));
        return consumeQuaternion(q);
      },
      relativeAngles(alpha, beta, gamma, angleDeg = null) {
        const q = orientationQuaternion(Number(alpha), Number(beta), Number(gamma), angleDeg == null ? getScreenAngle() : wrapAngle(Number(angleDeg) * DEG));
        if (!q || !state.calibrated) return null;
        return relativeAnglesFrom(q);
      }
    };

    syncButton();
    raf = requestAnimationFrame(frame);
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
