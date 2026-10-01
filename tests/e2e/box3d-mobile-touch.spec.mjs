import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function mobilePage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  return { context, page };
}

async function setupModel(page) {
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true,
    null,
    { timeout: 20000 }
  );
  return page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled = false;
    window.VoxelPhysics.state.running = false;
    app.voxels.clear();
    [[12,16,12,'#22D3EE'],[12,17,12,'#F59E0B'],[13,18,12,'#A78BFA']].forEach(([x,y,z,color]) => {
      app.voxels.set(app.key(x,y,z), { color, glass:false });
    });
    app.updateInstancedVoxels?.();
    return {
      snapshot: [...app.voxels.entries()].map(([k,v]) => [String(k), v.color, !!v.glass]),
      mode: app.mobileCanvasMode || 'view'
    };
  });
}

async function buttonCenter(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no hit box`);
  return { x: box.x + box.width/2, y: box.y + box.height/2 };
}

async function playByTouch(page) {
  const p = await buttonCenter(page, '#vs-physics-test');
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelPhysics.state.enabled === true);
  await page.waitForFunction(() => window.VoxelPhysicsInputRouter.mode === 'physics');
}

async function stopByTouch(page) {
  const p = await buttonCenter(page, '#vs-physics-test');
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() =>
    window.VoxelBox3D.running === false &&
    window.VoxelPhysics.state.running === false &&
    window.VoxelPhysics.state.enabled === false
  );
}

async function projectFirstBody(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const body = window.VoxelBox3D.snapshotBodies()[0];
    const rect = app.cvs.getBoundingClientRect();
    const p = new THREE.Vector3(body.x, body.y, body.z).project(app.cam);
    return {
      x: rect.left + (p.x + 1) * .5 * rect.width,
      y: rect.top + (1 - p.y) * .5 * rect.height,
      body,
      camera: app.cam.position.toArray(),
      quaternion: app.cam.quaternion.toArray()
    };
  });
}

async function pointerDrag(page, from, to) {
  await page.evaluate(({ from, to }) => {
    const canvas = window.VoxelApp.cvs;
    const common = { bubbles:true, cancelable:true, composed:true, pointerId:77, pointerType:'touch', isPrimary:true, button:0, buttons:1 };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...common, clientX:from.x, clientY:from.y }));
    window.__touchMouseJointObserved = !!window.VoxelBox3D.mouseGrabActive;
    const steps = 8;
    for (let i=1;i<=steps;i++) {
      const t = i/steps;
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        ...common,
        clientX: from.x + (to.x-from.x)*t,
        clientY: from.y + (to.y-from.y)*t
      }));
      window.__touchMouseJointObserved ||= !!window.VoxelBox3D.mouseGrabActive;
    }
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons:0, clientX:to.x, clientY:to.y }));
  }, { from, to });
}

async function orbitPointerDrag(page, from, to) {
  await page.evaluate(({ from, to }) => {
    const canvas = window.VoxelApp.cvs;
    const common = { bubbles:true, cancelable:true, composed:true, pointerId:88, pointerType:'touch', isPrimary:true, button:0, buttons:1 };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...common, clientX:from.x, clientY:from.y }));
    const steps = 10;
    for (let i=1;i<=steps;i++) {
      const t = i/steps;
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        ...common,
        clientX: from.x + (to.x-from.x)*t,
        clientY: from.y + (to.y-from.y)*t
      }));
    }
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons:0, clientX:to.x, clientY:to.y }));
  }, { from, to });
}

test('mobile Physics toggles Grab <-> Orbit while Box3D keeps running and restores authoring mode', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await setupModel(page);

  expect(await page.locator('#vs-physics-toggle-desktop').count()).toBe(0);
  expect(await page.locator('#vs-physics-panel').count()).toBe(0);
  expect(await page.locator('#vs-physics-toolbar').count()).toBe(0);

  const playHit = await page.evaluate(() => {
    const b = document.querySelector('#vs-physics-test');
    const r = b.getBoundingClientRect();
    const x = r.left + r.width/2;
    const y = r.top + r.height/2;
    return {
      left:r.left,
      visible:r.width>0 && r.height>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,
      hit:!!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'),
      disabled:b.disabled
    };
  });
  expect(playHit.visible).toBe(true);
  expect(playHit.hit).toBe(true);
  expect(playHit.disabled).toBe(false);
  expect(playHit.left).toBeLessThanOrEqual(20);

  const modeButton = page.locator('#mobile-canvas-mode-toggle');
  await expect(modeButton).toBeVisible();
  const m = await buttonCenter(page, '#mobile-canvas-mode-toggle');

  // Outside simulation this remains the ordinary Orbit/Edit authoring toggle.
  const first = await modeButton.getAttribute('data-mode');
  expect(['view','edit']).toContain(first);
  await page.touchscreen.tap(m.x,m.y);
  await page.waitForTimeout(100);
  const second = await modeButton.getAttribute('data-mode');
  expect(['view','edit']).toContain(second);
  expect(second).not.toBe(first);
  await page.touchscreen.tap(m.x,m.y);
  await page.waitForTimeout(100);
  expect(await modeButton.getAttribute('data-mode')).toBe(first);

  const modeBeforePlay = await page.evaluate(() => window.VoxelApp.mobileCanvasMode || 'view');
  await playByTouch(page);
  expect(await page.evaluate(() => window.VoxelBox3D.running)).toBe(true);
  expect(await page.evaluate(() => window.VoxelPhysicsInputRouter.physicsInputMode)).toBe('grab');
  expect(await modeButton.getAttribute('data-mode')).toBe('physics-grab');

  // Same mode button temporarily hands the still-running simulation to Orbit.
  await page.touchscreen.tap(m.x,m.y);
  await page.waitForFunction(() => window.VoxelPhysicsInputRouter.mode === 'physics-orbit');
  expect(await page.evaluate(() => window.VoxelBox3D.running)).toBe(true);
  expect(await page.evaluate(() => window.VoxelPhysics.state.enabled)).toBe(true);
  expect(await page.evaluate(() => window.VoxelBox3D.mouseGrabActive)).toBe(false);
  expect(await page.evaluate(() => window.VoxelApp.mobileCanvasMode)).toBe('view');
  expect(await modeButton.getAttribute('data-mode')).toBe('physics-orbit');

  const cameraBeforeOrbit = await page.evaluate(() => ({
    p:window.VoxelApp.cam.position.toArray(),
    q:window.VoxelApp.cam.quaternion.toArray()
  }));
  const canvasBox = await page.locator('#canvas-container canvas').first().boundingBox().catch(() => null)
    || await page.locator('canvas').first().boundingBox();
  if (!canvasBox) throw new Error('canvas has no hit box');
  await orbitPointerDrag(page,
    {x:canvasBox.x+canvasBox.width*.72, y:canvasBox.y+canvasBox.height*.48},
    {x:canvasBox.x+canvasBox.width*.46, y:canvasBox.y+canvasBox.height*.36}
  );
  await page.waitForTimeout(120);
  const cameraAfterOrbit = await page.evaluate(() => ({
    p:window.VoxelApp.cam.position.toArray(),
    q:window.VoxelApp.cam.quaternion.toArray(),
    grabbed:window.VoxelBox3D.mouseGrabActive,
    running:window.VoxelBox3D.running
  }));
  const orbitCameraDelta = Math.hypot(...cameraAfterOrbit.p.map((v,i)=>v-cameraBeforeOrbit.p[i]));
  const orbitQuatDelta = Math.hypot(...cameraAfterOrbit.q.map((v,i)=>v-cameraBeforeOrbit.q[i]));
  expect(Math.max(orbitCameraDelta,orbitQuatDelta)).toBeGreaterThan(1e-5);
  expect(cameraAfterOrbit.grabbed).toBe(false);
  expect(cameraAfterOrbit.running).toBe(true);

  // Toggle back: mouse joints immediately own the canvas again; no simulation restart.
  await page.touchscreen.tap(m.x,m.y);
  await page.waitForFunction(() => window.VoxelPhysicsInputRouter.mode === 'physics');
  expect(await page.evaluate(() => window.VoxelPhysicsInputRouter.physicsInputMode)).toBe('grab');
  expect(await page.evaluate(() => window.VoxelBox3D.running)).toBe(true);
  expect(await modeButton.getAttribute('data-mode')).toBe('physics-grab');

  await stopByTouch(page);
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.VoxelApp.mobileCanvasMode || 'view')).toBe(modeBeforePlay);
  expect(await page.evaluate(() => window.VoxelPhysicsInputRouter.mode)).toBe(modeBeforePlay === 'edit' ? 'edit' : 'orbit');
  await context.close();
});

test('mobile drag uses native Box3D 3D mouse joint and never orbits the camera in Grab mode', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type()==='error' && /box3d|wasm/i.test(msg.text())) errors.push(msg.text()); });

  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await setupModel(page);
  await playByTouch(page);
  await page.waitForTimeout(80);

  const projected = await projectFirstBody(page);
  const before = await page.evaluate(() => ({
    bodies: window.VoxelBox3D.snapshotBodies(),
    camera: window.VoxelApp.cam.position.toArray(),
    quaternion: window.VoxelApp.cam.quaternion.toArray()
  }));

  await pointerDrag(page, { x:projected.x, y:projected.y }, { x:projected.x+90, y:projected.y-28 });
  await page.waitForTimeout(450);

  const after = await page.evaluate(() => ({
    bodies: window.VoxelBox3D.snapshotBodies(),
    camera: window.VoxelApp.cam.position.toArray(),
    quaternion: window.VoxelApp.cam.quaternion.toArray(),
    router: window.VoxelPhysicsInputRouter.mode,
    observedNativeMouseJoint: !!window.__touchMouseJointObserved,
    mouseJointReleased: !window.VoxelBox3D.mouseGrabActive
  }));

  const bodyDelta = Math.hypot(
    after.bodies[0].x-before.bodies[0].x,
    after.bodies[0].y-before.bodies[0].y,
    after.bodies[0].z-before.bodies[0].z
  );
  const cameraDelta = Math.hypot(...after.camera.map((v,i) => v-before.camera[i]));
  const quatDelta = Math.hypot(...after.quaternion.map((v,i) => v-before.quaternion[i]));

  expect(after.observedNativeMouseJoint).toBe(true);
  expect(after.mouseJointReleased).toBe(true);
  expect(bodyDelta).toBeGreaterThan(.08);
  expect(cameraDelta).toBeLessThan(1e-6);
  expect(quatDelta).toBeLessThan(1e-6);
  expect(after.router).toBe('physics');
  expect(errors).toEqual([]);

  await stopByTouch(page);
  await context.close();
});

test('Stop destroys simulation and restores exact authoring origin', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  const setup = await setupModel(page);
  const modeBefore = await page.evaluate(() => window.VoxelApp.mobileCanvasMode || 'view');

  await playByTouch(page);
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'))).toBe(true);

  await stopByTouch(page);
  const reset = await page.evaluate(() => ({
    sim: !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),
    preview: window.VoxelPhysics.state.preview,
    snapshot: [...window.VoxelApp.voxels.entries()].map(([k,v]) => [String(k),v.color,!!v.glass]),
    mode: window.VoxelApp.mobileCanvasMode || 'view'
  }));

  expect(reset.sim).toBe(false);
  expect(reset.preview).toBe(null);
  expect(reset.snapshot).toEqual(setup.snapshot);
  expect(reset.mode).toBe(modeBefore);
  await context.close();
});

test('Play/Stop stays deterministic under repeated real touch taps', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await setupModel(page);

  for (let i=0;i<8;i++) {
    await playByTouch(page);
    expect(await page.evaluate(() => window.VoxelPhysicsInputRouter.mode)).toBe('physics');
    await stopByTouch(page);
    expect(await page.evaluate(() => window.VoxelBox3D.getStatus?.().transition)).toBe('stopped');
  }

  expect(await page.locator('#vs-physics-test').isEnabled()).toBe(true);
  expect(await page.evaluate(() => !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'))).toBe(false);
  await context.close();
});

test('Undo/Redo resets a running simulation before changing authoring history', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await setupModel(page);

  await page.evaluate(() => {
    const app = window.VoxelApp;
    const key = app.key(20,20,20);
    app.history = [];
    app.historyPointer = -1;
    app.voxels.set(key,{color:'#FF00FF',glass:false});
    app.updateInstancedVoxels?.();
    app.addHistoryStep({ type:'MODIFY', changes:new Map([[key,{before:null,after:{color:'#FF00FF',glass:false}}]]) });
    window.__historyTouchKey = key;
  });

  await playByTouch(page);
  expect(await page.evaluate(() => window.VoxelBox3D.running)).toBe(true);

  await page.evaluate(() => window.VoxelApp.undo());
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelApp.voxels.has(window.__historyTouchKey));
  expect(await page.evaluate(() => window.VoxelPhysics.state.enabled)).toBe(false);

  await page.evaluate(() => window.VoxelApp.redo());
  await page.waitForFunction(() => window.VoxelApp.voxels.has(window.__historyTouchKey));
  await context.close();
});
