import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voxelshaper_onboarding_dont_show', 'true');
  });
});

async function ready(page) {
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true,
    null,
    { timeout:20000 }
  );
  return page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled = false;
    window.VoxelPhysics.state.running = false;
    app.setBrushSize?.(1);
    app.voxels.clear();
    [[12,16,12,'#22D3EE'],[12,17,12,'#F59E0B'],[13,18,12,'#A78BFA']].forEach(([x,y,z,color]) => {
      app.voxels.set(app.key(x,y,z), {color,glass:false});
    });
    app.updateInstancedVoxels?.();
    return [...app.voxels.entries()].map(([k,v]) => [String(k),v.color,!!v.glass]);
  });
}

async function center(page, selector) {
  const r = await page.locator(selector).boundingBox();
  if (!r) throw new Error(`${selector} has no hit box`);
  return {x:r.x+r.width/2,y:r.y+r.height/2,r};
}

async function projectFirstBody(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const body = window.VoxelBox3D.snapshotBodies()[0];
    const rect = app.cvs.getBoundingClientRect();
    const p = new THREE.Vector3(body.x,body.y,body.z).project(app.cam);
    return {
      x:rect.left+(p.x+1)*.5*rect.width,
      y:rect.top+(1-p.y)*.5*rect.height,
      body,
      camera:app.cam.position.toArray(),
      quaternion:app.cam.quaternion.toArray()
    };
  });
}

test('desktop Play is visible at left edge and native Box3D motor mouse joint owns drag', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type()==='error' && /box3d|wasm/i.test(msg.text())) errors.push(msg.text()); });
  const original = await ready(page);

  const play = await center(page,'#vs-physics-test');
  const hit = await page.evaluate(({x,y}) => ({
    hit:!!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'),
    disabled:document.querySelector('#vs-physics-test')?.disabled
  }), play);
  expect(play.r.x).toBeLessThanOrEqual(24);
  expect(play.r.y).toBeGreaterThanOrEqual(0);
  expect(play.r.x+play.r.width).toBeLessThanOrEqual(1280);
  expect(hit.hit).toBe(true);
  expect(hit.disabled).toBe(false);

  await page.mouse.move(play.x,play.y);
  await page.mouse.click(play.x,play.y);
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForTimeout(80);

  const projected = await projectFirstBody(page);
  const before = await page.evaluate(() => ({
    body:window.VoxelBox3D.snapshotBodies()[0],
    camera:window.VoxelApp.cam.position.toArray(),
    quaternion:window.VoxelApp.cam.quaternion.toArray()
  }));

  await page.mouse.move(projected.x,projected.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.VoxelBox3D.mouseGrabActive === true && window.VoxelPhysicsInputRouter.dragging === true);
  await page.mouse.move(projected.x+110,projected.y-35,{steps:14});
  await page.waitForTimeout(320);

  const during = await page.evaluate(() => ({
    body:window.VoxelBox3D.snapshotBodies()[0],
    camera:window.VoxelApp.cam.position.toArray(),
    quaternion:window.VoxelApp.cam.quaternion.toArray(),
    mouseGrab:window.VoxelBox3D.mouseGrabActive,
    grabCount:window.VoxelBox3D.mouseGrabCount,
    router:window.VoxelPhysicsInputRouter.mode
  }));

  const bodyDelta = Math.hypot(
    during.body.x-before.body.x,
    during.body.y-before.body.y,
    during.body.z-before.body.z
  );
  const cameraDelta = Math.hypot(...during.camera.map((v,i)=>v-before.camera[i]));
  const quatDelta = Math.hypot(...during.quaternion.map((v,i)=>v-before.quaternion[i]));
  expect(during.mouseGrab).toBe(true);
  expect(during.grabCount).toBe(1);
  expect(during.router).toBe('physics');
  expect(bodyDelta).toBeGreaterThan(.08);
  expect(cameraDelta).toBeLessThan(1e-6);
  expect(quatDelta).toBeLessThan(1e-6);

  await page.mouse.up();
  await page.waitForFunction(() => !window.VoxelBox3D.mouseGrabActive && !window.VoxelPhysicsInputRouter.dragging);

  const stop = await center(page,'#vs-physics-test');
  await page.mouse.click(stop.x,stop.y);
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);

  const reset = await page.evaluate(() => ({
    sim:!!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),
    snapshot:[...window.VoxelApp.voxels.entries()].map(([k,v])=>[String(k),v.color,!!v.glass])
  }));
  expect(reset.sim).toBe(false);
  expect(reset.snapshot).toEqual(original);
  expect(errors).toEqual([]);
});

test('3x3 brush creates one native Box3D mouse-grab group for the 3x3 face patch', async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true,
    null,
    { timeout:20000 }
  );

  await page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled = false;
    window.VoxelPhysics.state.running = false;
    app.setBrushSize?.(3);
    app.voxels.clear();
    for (let x=12;x<=14;x++) {
      for (let z=12;z<=14;z++) {
        app.voxels.set(app.key(x,16,z), {color:'#22D3EE',glass:false});
      }
    }
    app.updateInstancedVoxels?.();
  });

  const play = await center(page,'#vs-physics-test');
  await page.mouse.click(play.x,play.y);
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForTimeout(80);

  const result = await page.evaluate(async () => {
    const app = window.VoxelApp;
    const box = window.VoxelBox3D;
    const bodies = box.snapshotBodies();
    const centerKey = app.key(13,16,13);
    const centerIndex = bodies.findIndex((body) => body.key === centerKey);
    const selected = box.brushBodyIndices({
      index:centerIndex,
      normal:new THREE.Vector3(0,1,0)
    }, app.brushSize);
    const centerBody = bodies[centerIndex];
    const point = new THREE.Vector3(centerBody.x, centerBody.y, centerBody.z);
    const before = bodies.map((b) => ({...b}));
    const started = box.beginMouseGrab(selected, point, 100);
    box.updateMouseGrab(new THREE.Vector3(point.x + 1.2, point.y + .2, point.z));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const after = box.snapshotBodies();
    const moved = selected.filter((index) => {
      const a = before[index];
      const b = after[index];
      return Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z) > .04;
    }).length;
    return {
      brushSize:app.brushSize,
      selected,
      started,
      nativeCount:box.mouseGrabCount,
      moved
    };
  });

  expect(result.brushSize).toBe(3);
  expect(result.selected).toHaveLength(9);
  expect(result.started).toBe(true);
  expect(result.nativeCount).toBe(9);
  expect(result.moved).toBeGreaterThanOrEqual(7);

  await page.evaluate(() => window.VoxelBox3D.endMouseGrab());
  expect(await page.evaluate(() => window.VoxelBox3D.mouseGrabCount)).toBe(0);

  const one = await page.evaluate(() => {
    const app = window.VoxelApp;
    app.setBrushSize?.(1);
    const bodies = window.VoxelBox3D.snapshotBodies();
    const centerIndex = bodies.findIndex((body) => body.key === app.key(13,16,13));
    return window.VoxelBox3D.brushBodyIndices({ index:centerIndex, normal:new THREE.Vector3(0,1,0) }, app.brushSize);
  });
  expect(one).toHaveLength(1);

  await page.locator('#vs-physics-test').click();
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
});