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
  await page.waitForFunction(() => window.VoxelApp && window.VoxelPhysics?.simpleMode && window.VoxelBox3D?.hardened, null, { timeout: 20000 });
  await page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    app.voxels.clear();
    [[3,5,3,'#22D3EE'],[3,6,3,'#F59E0B'],[4,7,3,'#A78BFA']].forEach(([x,y,z,color]) => {
      app.voxels.set(app.key(x,y,z), { color, glass:false });
    });
    app.updateInstancedVoxels?.();
  });
}

async function enterPhysicsByTouch(page) {
  const btn = page.locator('#mobile-canvas-mode-toggle');
  await expect(btn).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const mode = await btn.getAttribute('data-mode');
    if (mode === 'physics') return;
    const r = await btn.boundingBox();
    if (!r) throw new Error('mode toggle has no hit box');
    await page.touchscreen.tap(r.x + r.width/2, r.y + r.height/2);
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => window.VoxelPhysics.state.enabled === true);
}

test('mobile simple physics exposes only Play/Pause and works by real touch', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /box3d|wasm|voxelshaper\]\[box3d/i.test(msg.text())) errors.push(`console: ${msg.text()}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await setupModel(page);
  await enterPhysicsByTouch(page);

  expect(await page.locator('#vs-physics-panel').count()).toBe(0);
  expect(await page.locator('#vs-physics-toolbar').count()).toBe(0);
  expect(await page.locator('[data-type="hinge"]').count()).toBe(0);
  expect(await page.locator('#vs-physics-motor').count()).toBe(0);

  const hit = await page.evaluate(() => {
    const button = document.querySelector('#vs-physics-test');
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return {
      x, y,
      disabled: button.disabled,
      visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      hit: !!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test')
    };
  });
  expect(hit.disabled).toBe(false);
  expect(hit.visible).toBe(true);
  expect(hit.hit).toBe(true);

  await page.touchscreen.tap(hit.x, hit.y);
  await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelBox3D.bodyCount === 3);
  await page.waitForTimeout(500);

  const pause = await page.evaluate(() => {
    const button = document.querySelector('#vs-physics-test');
    const r = button.getBoundingClientRect();
    const x = r.left + r.width/2;
    const y = r.top + r.height/2;
    return { x, y, hit: !!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test') };
  });
  expect(pause.hit).toBe(true);
  await page.touchscreen.tap(pause.x, pause.y);
  await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);
  expect(await page.evaluate(() => !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'))).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

test('mobile Play/Pause remains deterministic under repeated touch taps', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await setupModel(page);
  await enterPhysicsByTouch(page);

  for (let i = 0; i < 8; i++) {
    const p = await page.locator('#vs-physics-test').boundingBox();
    await page.touchscreen.tap(p.x + p.width/2, p.y + p.height/2);
    await page.waitForFunction(() => window.VoxelBox3D.running === true);
    await page.touchscreen.tap(p.x + p.width/2, p.y + p.height/2);
    await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelBox3D.getStatus?.().transition === 'stopped');
  }

  const final = await page.evaluate(() => ({
    disabled: document.querySelector('#vs-physics-test')?.disabled,
    sim: !!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),
    status: window.VoxelBox3D.getStatus?.()
  }));
  expect(final.disabled).toBe(false);
  expect(final.sim).toBe(false);
  expect(final.status.transition).toBe('stopped');
  await context.close();
});

test('Undo and Redo still work while simple Physics mode is enabled', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await setupModel(page);
  await enterPhysicsByTouch(page);

  const setup = await page.evaluate(() => {
    const app = window.VoxelApp;
    const key = app.key(12,12,12);
    app.history = [];
    app.historyPointer = -1;
    app.addInstancedVoxel(key, 12,12,12, '#FF00FF', false);
    app.voxels.set(key, { color:'#FF00FF', glass:false });
    app.addHistoryStep({ type:'MODIFY', changes:new Map([[key,{before:null,after:{color:'#FF00FF',glass:false}}]]) });
    window.__historyTouchKey = key;
    return app.voxels.has(key);
  });
  expect(setup).toBe(true);

  const undo = await page.locator('#mobile-overlay-undo').boundingBox();
  await page.touchscreen.tap(undo.x + undo.width/2, undo.y + undo.height/2);
  await page.waitForFunction(() => !window.VoxelApp.voxels.has(window.__historyTouchKey));

  const redo = await page.locator('#mobile-overlay-redo').boundingBox();
  await page.touchscreen.tap(redo.x + redo.width/2, redo.y + redo.height/2);
  await page.waitForFunction(() => window.VoxelApp.voxels.has(window.__historyTouchKey));
  await context.close();
});
