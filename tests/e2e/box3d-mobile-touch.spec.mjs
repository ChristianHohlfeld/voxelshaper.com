import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

test('mobile physics Play is visible, hit-testable and works by touch', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /box3d|wasm|voxelshaper\]\[box3d/i.test(msg.text())) errors.push(`console: ${msg.text()}`);
  });

  await page.goto(`${BASE}/?physicsTest=pendulum`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysics?.state?.joints?.length === 1 &&
    document.querySelector('#vs-physics-toolbar.show #vs-physics-test'),
    null,
    { timeout: 20000 }
  );

  const hit = await page.evaluate(() => {
    const button = document.querySelector('#vs-physics-test');
    const toolbar = document.querySelector('#vs-physics-toolbar');
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const target = document.elementFromPoint(x, y);
    return {
      x, y,
      disabled: button.disabled,
      visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      first: toolbar.firstElementChild === button,
      hit: !!target?.closest?.('#vs-physics-test')
    };
  });

  expect(hit.disabled).toBe(false);
  expect(hit.visible).toBe(true);
  expect(hit.first).toBe(true);
  expect(hit.hit).toBe(true);

  await page.touchscreen.tap(hit.x, hit.y);
  await page.waitForFunction(() => window.VoxelBox3D.running === true && window.VoxelPhysics.state.running === true);

  const stopHit = await page.evaluate(() => {
    const button = document.querySelector('#vs-physics-test');
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return { x, y, hit: !!document.elementFromPoint(x, y)?.closest?.('#vs-physics-test') };
  });
  expect(stopHit.hit).toBe(true);

  await page.touchscreen.tap(stopHit.x, stopHit.y);
  await page.waitForFunction(() => window.VoxelBox3D.running === false && window.VoxelPhysics.state.running === false);
  expect(errors).toEqual([]);

  await context.close();
});
