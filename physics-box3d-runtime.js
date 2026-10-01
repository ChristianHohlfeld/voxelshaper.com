(function () {
  'use strict';

  const SOURCE_COMMIT = '9f998c862d54c03a633ecea3831937385c78b532';
  const FIXED_DT = 1 / 60;
  const SUBSTEPS = 4;

  let app = null;
  let physics = null;
  let modulePromise = null;
  let api = null;
  let running = false;
  let raf = 0;
  let lastTime = 0;
  let accumulator = 0;
  let bodyRecords = [];
  let boundaryHandle = 0;
  let worldExtent = 0;
  let renderRoot = null;
  let renderMesh = null;
  let renderGeometry = null;
  let visibilitySnapshot = [];
  let motionListener = null;
  let motionPermissionGranted = false;

  const tmpPosition = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  const tmpMatrix = new THREE.Matrix4();
  const tmpRight = new THREE.Vector3();
  const tmpForward = new THREE.Vector3();
  const tmpForce = new THREE.Vector3();

  function toast(title, text, type = 'info', ms = 1300) {
    try { app?.showToast?.(title, text, type, ms); } catch (_) {}
  }

  function syncPlayUI() {
    const button = document.getElementById('vs-physics-test');
    if (button) {
      button.disabled = false;
      button.classList.toggle('show', !!physics?.state?.enabled);
      button.setAttribute('aria-pressed', running ? 'true' : 'false');
      button.setAttribute('aria-label', running ? 'Pause and reset physics' : 'Play physics');
      const icon = button.querySelector('i');
      if (icon) icon.className = running ? 'fas fa-pause' : 'fas fa-play';
    }
    physics?.syncUi?.();
  }

  function ensureModule() {
    if (modulePromise) return modulePromise;
    if (typeof window.createVoxelBox3DModule !== 'function') {
      return Promise.reject(new Error('Box3D loader missing'));
    }
    modulePromise = window.createVoxelBox3DModule({
      locateFile: (name) => name.endsWith('.wasm') ? 'lib/box3d/box3d.wasm' : `lib/box3d/${name}`
    }).then((mod) => {
      api = {
        reset: mod.cwrap('vsb3_reset', 'number', ['number','number','number']),
        destroy: mod.cwrap('vsb3_destroy', null, []),
        createBody: mod.cwrap('vsb3_create_body', 'number', Array(11).fill('number')),
        addBox: mod.cwrap('vsb3_add_box', 'number', Array(11).fill('number')),
        step: mod.cwrap('vsb3_step', null, ['number','number']),
        applyForce: mod.cwrap('vsb3_apply_force', null, ['number','number','number','number']),
        bodyMass: mod.cwrap('vsb3_body_mass', 'number', ['number']),
        px: mod.cwrap('vsb3_body_px', 'number', ['number']),
        py: mod.cwrap('vsb3_body_py', 'number', ['number']),
        pz: mod.cwrap('vsb3_body_pz', 'number', ['number']),
        qx: mod.cwrap('vsb3_body_qx', 'number', ['number']),
        qy: mod.cwrap('vsb3_body_qy', 'number', ['number']),
        qz: mod.cwrap('vsb3_body_qz', 'number', ['number']),
        qw: mod.cwrap('vsb3_body_qw', 'number', ['number'])
      };
      return mod;
    }).catch((err) => {
      modulePromise = null;
      api = null;
      throw err;
    });
    return modulePromise;
  }

  function voxelColor(value) {
    if (value && typeof value === 'object' && value.color) return value.color;
    if (typeof value === 'string') return value;
    return '#ffffff';
  }

  function rememberAndHide(obj) {
    if (!obj || visibilitySnapshot.some((x) => x.obj === obj)) return;
    visibilitySnapshot.push({ obj, visible: obj.visible });
    obj.visible = false;
  }

  function hideAuthoringModel() {
    visibilitySnapshot = [];
    rememberAndHide(app.originalVoxelsGroup);
    rememberAndHide(app.roundedVoxelsGroup);
    rememberAndHide(app.solidInstancedMesh);
    rememberAndHide(app.glassInstancedMesh);
  }

  function restoreAuthoringModel() {
    for (const item of visibilitySnapshot) item.obj.visible = item.visible;
    visibilitySnapshot = [];
  }

  function buildRenderMesh(voxels) {
    const size = app.VS || 1;
    renderRoot = new THREE.Group();
    renderRoot.name = 'VoxelBox3DSimple';
    renderGeometry = new THREE.BoxGeometry(size * .965, size * .965, size * .965);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: .52,
      metalness: .02,
      transparent: false
    });
    renderMesh = new THREE.InstancedMesh(renderGeometry, material, voxels.length);
    renderMesh.name = 'VoxelBox3DSimpleBodies';
    renderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    renderMesh.castShadow = true;
    renderMesh.receiveShadow = true;
    renderRoot.add(renderMesh);
    app.scene.add(renderRoot);
  }

  function addBoundaryBox(handle, ox, oy, oz, hx, hy, hz) {
    if (!api.addBox(handle, ox,oy,oz, hx,hy,hz, 1,.82,.02,0)) {
      throw new Error('Box3D boundary collider creation failed');
    }
  }

  function buildBoundaries(size) {
    worldExtent = Math.max(size, (app.GRID || 32) * size);
    const half = worldExtent * .5;
    const wall = Math.max(size * .5, .25);

    // One static body with six box shapes. Inner faces align exactly with the
    // editor volume [0, worldExtent] on X/Y/Z, matching the visible bounding box.
    boundaryHandle = api.createBody(0, half,half,half, 0,0,0,1, 0,0,0);
    if (!boundaryHandle) throw new Error('Box3D boundary body creation failed');

    const span = half + wall;
    addBoundaryBox(boundaryHandle, 0, -half-wall, 0, span,wall,span); // floor y=0
    addBoundaryBox(boundaryHandle, 0,  half+wall, 0, span,wall,span); // ceiling y=max
    addBoundaryBox(boundaryHandle, -half-wall, 0, 0, wall,span,span); // x=0
    addBoundaryBox(boundaryHandle,  half+wall, 0, 0, wall,span,span); // x=max
    addBoundaryBox(boundaryHandle, 0, 0, -half-wall, span,span,wall); // z=0
    addBoundaryBox(boundaryHandle, 0, 0,  half+wall, span,span,wall); // z=max
  }

  function buildWorld() {
    const entries = [...app.voxels.entries()];
    if (!entries.length) throw new Error('No voxels to simulate');
    buildRenderMesh(entries);

    const size = app.VS || 1;
    bodyRecords = [];

    entries.forEach(([key, value], index) => {
      const p = app.parseKey(key);
      const x = (p[0] + .5) * size;
      const y = (p[1] + .5) * size;
      const z = (p[2] + .5) * size;
      const handle = api.createBody(2, x, y, z, 0,0,0,1, 1, .035, .045);
      if (!handle) throw new Error(`Box3D body creation failed at voxel ${index}`);
      if (!api.addBox(handle, 0,0,0, size*.485,size*.485,size*.485, 1,.68,.045,0)) {
        throw new Error(`Box3D collider creation failed at voxel ${index}`);
      }

      // Match the editor's exact instanced-color path. The editor stores CSS/hex
      // colors as sRGB and converts them to linear before setColorAt(). Without
      // this conversion the temporary physics copy looks pale/washed out.
      const color = new THREE.Color(voxelColor(value));
      if (typeof color.convertSRGBToLinear === 'function') color.convertSRGBToLinear();
      renderMesh.setColorAt(index, color);

      tmpPosition.set(x,y,z);
      tmpQuaternion.identity();
      tmpMatrix.compose(tmpPosition,tmpQuaternion,tmpScale);
      renderMesh.setMatrixAt(index,tmpMatrix);
      bodyRecords.push({
        key,
        handle,
        index,
        mass: Math.max(.001, api.bodyMass(handle) || 1),
        start: { x, y, z }
      });
    });
    renderMesh.instanceMatrix.needsUpdate = true;
    if (renderMesh.instanceColor) renderMesh.instanceColor.needsUpdate = true;

    buildBoundaries(size);
    hideAuthoringModel();
  }

  function updateRender() {
    if (!renderMesh) return;
    for (const b of bodyRecords) {
      tmpPosition.set(api.px(b.handle), api.py(b.handle), api.pz(b.handle));
      tmpQuaternion.set(api.qx(b.handle), api.qy(b.handle), api.qz(b.handle), api.qw(b.handle)).normalize();
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      renderMesh.setMatrixAt(b.index, tmpMatrix);
    }
    renderMesh.instanceMatrix.needsUpdate = true;
  }

  function frame(now) {
    if (!running || !api) return;
    if (!physics?.state?.enabled || physics.state.running === false) {
      stop();
      return;
    }
    if (!lastTime) lastTime = now;
    const dt = Math.min(.08, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      api.step(FIXED_DT, SUBSTEPS);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    updateRender();
    raf = requestAnimationFrame(frame);
  }

  function removeRender() {
    if (renderRoot) renderRoot.parent?.remove(renderRoot);
    if (renderMesh?.material) renderMesh.material.dispose?.();
    renderGeometry?.dispose?.();
    renderRoot = null;
    renderMesh = null;
    renderGeometry = null;
    bodyRecords = [];
  }

  async function requestMotionPermission() {
    if (motionPermissionGranted) return true;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        motionPermissionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted';
      } else {
        motionPermissionGranted = typeof DeviceMotionEvent !== 'undefined';
      }
    } catch (_) {
      motionPermissionGranted = false;
    }
    return motionPermissionGranted;
  }

  function applyForceToAll(x, y, z, gain = 1) {
    if (!running || !api) return;
    for (const b of bodyRecords) {
      api.applyForce(b.handle, x * b.mass * gain, y * b.mass * gain, z * b.mass * gain);
    }
  }

  function startMotion() {
    if (!motionPermissionGranted || motionListener) return;
    motionListener = (event) => {
      if (!running || !bodyRecords.length) return;

      const gravity = event.accelerationIncludingGravity || {};
      const accel = event.acceleration || {};
      const gx = Number(gravity.x) || 0;
      const gy = Number(gravity.y) || 0;
      const ax = Number(accel.x) || 0;
      const ay = Number(accel.y) || 0;
      const az = Number(accel.z) || 0;

      const camera = app.camera || app.cam || app.activeCamera || app.currentCamera;
      tmpRight.set(1,0,0);
      tmpForward.set(0,0,-1);
      if (camera?.quaternion) {
        tmpRight.applyQuaternion(camera.quaternion);
        tmpForward.applyQuaternion(camera.quaternion);
      }
      tmpRight.y = 0;
      tmpForward.y = 0;
      if (tmpRight.lengthSq() < .001) tmpRight.set(1,0,0); else tmpRight.normalize();
      if (tmpForward.lengthSq() < .001) tmpForward.set(0,0,-1); else tmpForward.normalize();

      const side = gx * .9 + ax * 1.8;
      const forward = -gy * .9 - ay * 1.8;
      tmpForce.copy(tmpRight).multiplyScalar(side).addScaledVector(tmpForward, forward);
      tmpForce.y += az * .7;
      applyForceToAll(tmpForce.x, tmpForce.y, tmpForce.z, 1.35);
    };
    window.addEventListener('devicemotion', motionListener, { passive: true });
  }

  function stopMotion() {
    if (motionListener) window.removeEventListener('devicemotion', motionListener);
    motionListener = null;
  }

  async function start() {
    if (running) return true;
    if (!physics?.state?.enabled) return false;

    const permissionPromise = requestMotionPermission();
    try {
      await ensureModule();
      if (!api.reset(0, -9.81, 0)) throw new Error('Box3D world init failed');
      buildWorld();
      running = true;
      physics.state.running = true;
      physics.state.preview = renderRoot;
      lastTime = 0;
      accumulator = 0;
      syncPlayUI();

      const allowed = await permissionPromise;
      if (allowed) startMotion();
      toast('Physics', allowed ? 'Live · tilt or shake the phone' : 'Live · gravity enabled', 'info', 1300);
      raf = requestAnimationFrame(frame);
      return true;
    } catch (err) {
      console.error('[VoxelShaper][Box3D]', err);
      stop();
      toast('Physics', `Physics failed: ${err?.message || err}`, 'error', 2000);
      return false;
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
    accumulator = 0;
    stopMotion();
    removeRender();
    restoreAuthoringModel();
    try { api?.destroy?.(); } catch (_) {}
    boundaryHandle = 0;
    worldExtent = 0;
    if (physics?.state) {
      physics.state.running = false;
      physics.state.preview = null;
    }
    syncPlayUI();
    return true;
  }

  function snapshotBodies() {
    if (!api) return [];
    return bodyRecords.map((b) => ({
      key: b.key,
      x: api.px(b.handle),
      y: api.py(b.handle),
      z: api.pz(b.handle)
    }));
  }

  function toggle() {
    return running ? Promise.resolve(stop()) : start();
  }

  function install() {
    app = window.VoxelApp;
    physics = window.VoxelPhysics;
    if (!app || !physics?.simpleMode || !app.scene || !app.voxels) return false;
    if (window.VoxelBox3D?.installed && window.VoxelBox3D?.simpleMode) return true;
    window.VoxelBox3D = {
      installed: true,
      simpleMode: true,
      sourceCommit: SOURCE_COMMIT,
      get running() { return running; },
      get ready() { return !!api; },
      get bodyCount() { return bodyRecords.length; },
      get worldExtent() { return worldExtent; },
      start,
      stop,
      reset: stop,
      toggle,
      applyForce: applyForceToAll,
      snapshotBodies
    };
    syncPlayUI();
    return true;
  }

  const timer = setInterval(() => { if (install()) clearInterval(timer); }, 80);
  install();
})();
