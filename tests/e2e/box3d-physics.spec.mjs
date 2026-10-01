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

test.describe('VoxelShaper Box3D runtime', () => {
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

    expect(result.before).toBeGreaterThan(2.9);
    expect(result.after).toBeLessThan(result.before - 1);
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('motor hinge produces visible editor motion and stop removes simulation', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/?physicsTest=pendulum`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      window.VoxelApp &&
      window.VoxelPhysics?.state?.joints?.length === 1 &&
      window.VoxelBox3D?.hardened === true,
      null,
      { timeout: 20000 }
    );

    const started = await page.evaluate(() => window.VoxelBox3D.start());
    expect(started).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelPhysics.state.running === true);
    await page.waitForFunction(() => window.VoxelApp.scene.children.some((x) => String(x.name || '').startsWith('VoxelBox3D:')));

    const before = await page.evaluate(() => {
      const group = window.VoxelApp.scene.children.find((x) => String(x.name || '').startsWith('VoxelBox3D:'));
      return { p: group.position.toArray(), q: group.quaternion.toArray() };
    });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const group = window.VoxelApp.scene.children.find((x) => String(x.name || '').startsWith('VoxelBox3D:'));
      return { p: group.position.toArray(), q: group.quaternion.toArray() };
    });

    const delta = before.p.reduce((sum, v, i) => sum + Math.abs(v - after.p[i]), 0)
      + before.q.reduce((sum, v, i) => sum + Math.abs(v - after.q[i]), 0);
    expect(delta).toBeGreaterThan(0.05);

    const stopped = await page.evaluate(() => window.VoxelBox3D.stop());
    expect(stopped).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);

    const leftovers = await page.evaluate(() => ({
      preview: window.VoxelPhysics.state.preview,
      simGroups: window.VoxelApp.scene.children.filter((x) => String(x.name || '').startsWith('VoxelBox3D:')).length,
      status: window.VoxelBox3D.getStatus?.()
    }));
    expect(leftovers.preview).toBe(null);
    expect(leftovers.simGroups).toBe(0);
    expect(leftovers.status?.transition).toBe('stopped');
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('mobile Play and Stop are deterministic on the real toolbar button', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/?physicsTest=pendulum`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      window.VoxelBox3D?.hardened === true &&
      window.VoxelPhysics?.state?.joints?.length === 1 &&
      document.querySelector('#vs-physics-test'),
      null,
      { timeout: 20000 }
    );

    await page.evaluate(() => document.querySelector('#vs-physics-test').click());
    await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelPhysics.state.running === true);
    await page.waitForTimeout(450);

    const moved = await page.evaluate(() => {
      const group = window.VoxelApp.scene.children.find((x) => String(x.name || '').startsWith('VoxelBox3D:'));
      return !!group && Math.abs(group.quaternion.x) + Math.abs(group.quaternion.y) + Math.abs(group.quaternion.z) > 0.01;
    });
    expect(moved).toBe(true);

    await page.evaluate(() => document.querySelector('#vs-physics-test').click());
    await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);
    await page.waitForFunction(() => !window.VoxelApp.scene.children.some((x) => String(x.name || '').startsWith('VoxelBox3D:')));
    expect(relevantErrors(errors)).toEqual([]);
  });

  test('same connected A/B body fails loudly instead of running without motion', async ({ page }) => {
    const errors = collectPhysicsErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.VoxelApp && window.VoxelPhysics && window.VoxelBox3D?.hardened, null, { timeout: 20000 });

    const result = await page.evaluate(async () => {
      const app = window.VoxelApp;
      const p = window.VoxelPhysics;
      app.voxels.clear();
      app.voxels.set(app.key(0,0,0), { color:'#6b7280' });
      app.voxels.set(app.key(1,0,0), { color:'#f59e0b' });
      p.state.joints = [{
        id:'same-body', name:'Invalid self hinge', type:'hinge',
        baseSeed:[0,0,0], movingSeed:[1,0,0], anchor:[0.5,0.5,0.5], axis:[0,0,1],
        limits:{enabled:true,min:-45,max:45}, motor:{enabled:true,speed:90,strength:5}, preview:0
      }];
      p.state.active = 'same-body';
      p.state.enabled = true;
      p.state.running = false;
      const started = await window.VoxelBox3D.start();
      return { started, status: window.VoxelBox3D.getStatus() };
    });

    expect(result.started).toBe(false);
    expect(result.status.running).toBe(false);
    expect(result.status.lastError).toMatch(/same connected body/i);
    expect(relevantErrors(errors).some((x) => /same connected body/i.test(x))).toBe(true);
  });
});
