import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

function collectPhysicsErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

function relevantErrors(errors) {
  return errors.filter((x) => /box3d|wasm|voxelshaper\]\[box3d/i.test(x));
}

async function setupSimpleModel(page) {
  await page.waitForFunction(() => window.VoxelApp && window.VoxelPhysics?.simpleMode && window.VoxelBox3D?.hardened, null, { timeout: 20000 });
  return page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    app.voxels.clear();
    const cubes = [
      [3, 5, 3, '#22D3EE'],
      [3, 6, 3, '#F59E0B'],
      [4, 7, 3, '#A78BFA'],
      [4, 8, 4, '#34D399']
    ];
    for (const [x,y,z,color] of cubes) app.voxels.set(app.key(x,y,z), { color, glass:false });
    app.updateInstancedVoxels?.();
    window.VoxelPhysics.enable();
    const firstKey = app.key(3,5,3);
    const info = app.voxelToInstanceMap?.get(firstKey);
    let editorColor = null;
    if (info?.type === 'solid' && app.solidInstancedMesh?.getColorAt) {
      const c = new THREE.Color();
      app.solidInstancedMesh.getColorAt(info.index, c);
      editorColor = c.toArray();
    }
    return {
      count: app.voxels.size,
      editorColor,
      snapshot: [...app.voxels.entries()].map(([k,v]) => [String(k), v.color, !!v.glass])
    };
  });
}

test.describe('VoxelShaper simple Box3D runtime', () => {
  test('loads pinned Box3D WASM and advances a real dynamic body', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.createVoxelBox3DModule === 'function');

    const result = await page.evaluate(async () => {
      const mod = await window.createVoxelBox3DModule({
        locateFile: (name) => name.endsWith('.wasm') ? 'lib/box3d/box3d.wasm' : `lib/box3d/${name}`
      });
      const reset = mod.cwrap('vsb3_reset', 'number', ['number','number','number']);
      const destroy = mod.cwrap('vsb3_destroy', null, []);
      const createBody = mod.cwrap('vsb3_create_body', 'number', Array(11).fill('number'));
      const addBox = mod.cwrap('vsb3_add_box', 'number', Array(11).fill('number'));
      const step = mod.cwrap('vsb3_step', null, ['number','number']);
      const py = mod.cwrap('vsb3_body_py', 'number', ['number']);
      if (!reset(0, -9.81, 0)) throw new Error('world reset failed');
      const body = createBody(2, 0, 3, 0, 0,0,0,1, 1, .01, .01);
      if (!body) throw new Error('dynamic body creation failed');
      if (!addBox(body, 0,0,0, .5,.5,.5, 1,.5,.05,0)) throw new Error('box creation failed');
      const before = py(body);
      for (let i = 0; i < 60; i++) step(1/60, 4);
      const after = py(body);
      destroy();
      return { before, after };
    });

    expect(result.after).toBeLessThan(result.before - 1);
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('Play preserves editor color, uses one body per voxel, and Pause exactly resets authoring state', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const setup = await setupSimpleModel(page);
    expect(setup.count).toBe(4);

    expect(await page.evaluate(() => window.VoxelBox3D.start())).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelBox3D.bodyCount === 4);
    await page.waitForFunction(() => !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimpleBodies'));

    const physicsColor = await page.evaluate(() => {
      const mesh = window.VoxelApp.scene.getObjectByName('VoxelBox3DSimpleBodies');
      const c = new THREE.Color();
      mesh.getColorAt(0, c);
      return c.toArray();
    });
    expect(setup.editorColor).not.toBeNull();
    for (let i = 0; i < 3; i++) expect(Math.abs(physicsColor[i] - setup.editorColor[i])).toBeLessThan(1e-6);

    const beforeY = await page.evaluate(() => window.VoxelBox3D.snapshotBodies()[0].y);
    await page.waitForTimeout(700);
    const afterY = await page.evaluate(() => window.VoxelBox3D.snapshotBodies()[0].y);
    expect(afterY).toBeLessThan(beforeY - 0.1);

    expect(await page.evaluate(() => window.VoxelBox3D.stop())).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);

    const reset = await page.evaluate(() => ({
      simRoot: !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),
      preview: window.VoxelPhysics.state.preview,
      snapshot: [...window.VoxelApp.voxels.entries()].map(([k,v]) => [String(k), v.color, !!v.glass]),
      originalVisible: window.VoxelApp.originalVoxelsGroup?.visible
    }));
    expect(reset.simRoot).toBe(false);
    expect(reset.preview).toBe(null);
    expect(reset.snapshot).toEqual(setup.snapshot);
    expect(reset.originalVisible).not.toBe(false);
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('the editor bounding box is a six-sided physical container', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await setupSimpleModel(page);
    expect(await page.evaluate(() => window.VoxelBox3D.start())).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelBox3D.bodyCount === 4);

    const directions = [
      [3500,0,0],[-3500,0,0],[0,3500,0],[0,-3500,0],[0,0,3500],[0,0,-3500]
    ];
    for (const force of directions) {
      await page.evaluate(([x,y,z]) => {
        for (let i=0;i<7;i++) window.VoxelBox3D.applyForce(x,y,z,1);
      }, force);
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(500);

    const bounded = await page.evaluate(() => {
      const extent = window.VoxelBox3D.worldExtent;
      const radius = (window.VoxelApp.VS || 1) * .485;
      const bodies = window.VoxelBox3D.snapshotBodies();
      return {
        extent,
        radius,
        bodies,
        ok: bodies.every((b) =>
          b.x >= radius - .06 && b.x <= extent - radius + .06 &&
          b.y >= radius - .06 && b.y <= extent - radius + .06 &&
          b.z >= radius - .06 && b.z <= extent - radius + .06)
      };
    });
    expect(bounded.extent).toBeGreaterThan(0);
    expect(bounded.ok).toBe(true);

    await page.evaluate(() => window.VoxelBox3D.stop());
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('desktop exposes only Physics + Play/Pause and survives repeated cycles', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await setupSimpleModel(page);

    await page.waitForSelector('#vs-physics-toggle-desktop');
    expect(await page.locator('#vs-physics-panel').count()).toBe(0);
    expect(await page.locator('#vs-physics-toolbar').count()).toBe(0);
    expect(await page.locator('[data-type="hinge"]').count()).toBe(0);

    for (let i = 0; i < 8; i++) {
      await page.click('#vs-physics-test');
      await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelBox3D.getStatus?.().transition === 'running');
      await page.click('#vs-physics-test');
      await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelBox3D.getStatus?.().transition === 'stopped');
      expect(await page.locator('[name="VoxelBox3DSimple"]').count()).toBe(0);
    }
    expect(relevantErrors(errors)).toEqual([]);
  });
});
