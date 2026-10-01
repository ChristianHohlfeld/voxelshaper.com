import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function mobilePage(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  return { context, page };
}

async function ready(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelApp?.cam &&
    window.VoxelGyroNavigation?.installed === true &&
    window.VoxelPhysics?.simpleMode === true,
    null,
    { timeout: 20000 }
  );
  await page.evaluate(() => {
    window.VoxelPhysics.disable?.();
    window.VoxelApp.mobileCanvasMode = 'view';
    window.VoxelGyroNavigation.enableWithoutPrompt();
  });
}

async function emit(page, alpha, beta, gamma) {
  await page.evaluate(({ alpha, beta, gamma }) => {
    const ev = new Event('deviceorientation');
    Object.defineProperties(ev, {
      alpha: { value: alpha },
      beta: { value: beta },
      gamma: { value: gamma },
      absolute: { value: false }
    });
    window.dispatchEvent(ev);
  }, { alpha, beta, gamma });
}

async function cameraState(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const target = app.ensureOrbitTarget();
    const p = app.cam.position.clone();
    const toTarget = target.clone().sub(p).normalize();
    const dir = new THREE.Vector3();
    app.cam.getWorldDirection(dir);
    return {
      pos: [p.x,p.y,p.z],
      radius: p.distanceTo(target),
      lookDot: dir.dot(toTarget),
      gyro: { ...window.VoxelGyroNavigation.state }
    };
  });
}

function distance(a, b) {
  return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
}

test('gyro rotates the orbit deterministically while preserving framing', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await emit(page, 12, 15, -4);
  await page.waitForFunction(() => window.VoxelGyroNavigation.state.calibrated === true);
  const before = await cameraState(page);

  await emit(page, 37, 24, -4);
  await page.waitForTimeout(450);
  const after = await cameraState(page);

  expect(distance(before.pos, after.pos)).toBeGreaterThan(0.25);
  expect(Math.abs(after.radius - before.radius)).toBeLessThan(before.radius * 0.01 + 0.02);
  expect(after.lookDot).toBeGreaterThan(0.995);
  expect(after.gyro.enabled).toBe(true);
  await context.close();
});

test('tilted calibration does not cross-couple yaw into a wild pitch jump', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await page.evaluate(() => {
    const gyro = window.VoxelGyroNavigation;
    gyro.recenter();
    gyro.feed(123, 52, 31, 0);
  });
  const baseline = await page.evaluate(() => ({ ...window.VoxelGyroNavigation.state }));

  await page.evaluate(() => window.VoxelGyroNavigation.feed(143, 52, 31, 0));
  const moved = await page.evaluate(() => ({ ...window.VoxelGyroNavigation.state }));

  const yawDelta = Math.abs(Math.atan2(Math.sin(moved.targetYaw-baseline.baseYaw), Math.cos(moved.targetYaw-baseline.baseYaw)));
  const pitchDelta = Math.abs(moved.targetPitch-baseline.basePitch);
  expect(yawDelta).toBeGreaterThan(3 * Math.PI / 180);
  expect(pitchDelta).toBeLessThan(25 * Math.PI / 180);
  await context.close();
});

test('alpha wrap across 360 degrees does not create a camera jump', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await emit(page, 359.5, 8, 3);
  await page.waitForFunction(() => window.VoxelGyroNavigation.state.calibrated === true);
  const before = await cameraState(page);
  await emit(page, 0.5, 8, 3);
  await page.waitForTimeout(350);
  const after = await cameraState(page);

  expect(distance(before.pos, after.pos)).toBeLessThan(before.radius * 0.08 + 0.05);
  expect(after.lookDot).toBeGreaterThan(0.995);
  await context.close();
});

test('tiny sensor noise stays inside the dead zone', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await emit(page, 40, 12, -2);
  await page.waitForFunction(() => window.VoxelGyroNavigation.state.calibrated === true);
  const before = await cameraState(page);
  await emit(page, 40.05, 12.04, -2.03);
  await page.waitForTimeout(300);
  const after = await cameraState(page);

  expect(distance(before.pos, after.pos)).toBeLessThan(0.03);
  await context.close();
});

test('screen orientation change recenters instead of jumping the orbit', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await emit(page, 35, 18, 4);
  await page.waitForFunction(() => window.VoxelGyroNavigation.state.calibrated === true);
  const before = await cameraState(page);

  await page.evaluate(() => {
    window.VoxelGyroNavigation.state.needsRecenter = true;
    window.VoxelGyroNavigation.feed(35, 18, 4, 90);
  });
  await page.waitForTimeout(250);
  const after = await cameraState(page);

  expect(distance(before.pos, after.pos)).toBeLessThan(0.05);
  expect(after.lookDot).toBeGreaterThan(0.995);
  await context.close();
});

test('Physics mode suspends camera gyro so motion only drives Box3D', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);

  await emit(page, 10, 10, 0);
  await page.waitForFunction(() => window.VoxelGyroNavigation.state.calibrated === true);
  await page.evaluate(() => window.VoxelPhysics.enable());
  const before = await cameraState(page);
  await emit(page, 80, 45, 25);
  await page.waitForTimeout(350);
  const after = await cameraState(page);

  expect(distance(before.pos, after.pos)).toBeLessThan(0.01);
  await context.close();
});

test('camera button remains the explicit recenter/permission gesture', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  await ready(page);
  const button = page.locator('#mobile-camera');
  await expect(button).toBeVisible();
  expect(await button.getAttribute('data-gyro')).toBe('on');
  expect(await button.getAttribute('aria-label')).toContain('Recenter');
  await context.close();
});
