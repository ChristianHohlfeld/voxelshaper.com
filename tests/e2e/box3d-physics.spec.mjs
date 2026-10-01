import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

test.describe('VoxelShaper Box3D runtime', () => {
  test('loads pinned Box3D WASM and advances a real dynamic body', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
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
    expect(errors.filter((x) => /box3d|wasm/i.test(x))).toEqual([]);
  });

  test('VoxelBox3D play then stop terminates the simulation cleanly', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.VoxelApp && window.VoxelPhysics && window.VoxelBox3D?.installed, null, { timeout: 20000 });

    const prepared = await page.evaluate(() => {
      const app = window.VoxelApp;
      const p = window.VoxelPhysics;
      if (!(app.voxels instanceof Map) || typeof app.key !== 'function') return false;

      app.voxels.clear();
      app.voxels.set(app.key(0,0,0), { color:'#6b7280' });
      app.voxels.set(app.key(0,2,0), { color:'#f59e0b' });

      p.state.joints = [{
        id:'box3d-smoke-joint', name:'Smoke hinge', type:'hinge',
        baseSeed:[0,0,0], movingSeed:[0,2,0], anchor:[0.5,1.5,0.5], axis:[0,0,1],
        limits:{enabled:true,min:-75,max:75},
        motor:{enabled:false,speed:45,strength:1}, preview:0
      }];
      p.state.active = 'box3d-smoke-joint';
      p.state.enabled = true;
      p.state.running = false;
      return true;
    });
    expect(prepared).toBe(true);

    const started = await page.evaluate(() => window.VoxelBox3D.start());
    expect(started).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelPhysics.state.running === true);
    await page.waitForTimeout(180);

    const stopped = await page.evaluate(() => window.VoxelBox3D.stop());
    expect(stopped).toBe(true);
    await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);

    const leftovers = await page.evaluate(() => ({
      preview: window.VoxelPhysics.state.preview,
      simGroups: window.VoxelApp.scene.children.filter((x) => String(x.name || '').startsWith('VoxelBox3D:')).length
    }));
    expect(leftovers.preview).toBe(null);
    expect(leftovers.simGroups).toBe(0);
  });
});
