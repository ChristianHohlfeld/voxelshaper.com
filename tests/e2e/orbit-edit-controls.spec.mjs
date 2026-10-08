import { test, expect, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const js = 'application/javascript; charset=utf-8';

async function mockDependencies(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (url.hostname === 'api.voxelshaper.com') {
      return route.fulfill({
        status: 401,
        headers: { 'Access-Control-Allow-Origin': route.request().headers().origin || '*', 'Access-Control-Allow-Credentials': 'true' },
        contentType: 'application/json',
        body: '{"error":"no session"}'
      });
    }
    if (url.hostname === 'www.googletagmanager.com' || url.hostname === 'www.google-analytics.com') return route.fulfill({ contentType: js, body: '' });
    if (url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'unpkg.com') return route.fulfill({ contentType: js, body: '' });
    if (url.hostname === 'cdn.jsdelivr.net' && p.endsWith('/three.min.js')) return route.fulfill({ path: path.join(appRoot, 'lib/three.min.js'), contentType: js });
    if (url.hostname === 'cdn.jsdelivr.net' && p.endsWith('/STLExporter.js')) return route.fulfill({ path: path.join(appRoot, 'lib/STLExporter.js'), contentType: js });
    if (url.hostname === 'cdn.jsdelivr.net' && p.endsWith('/BufferGeometryUtils.js')) return route.fulfill({ path: path.join(appRoot, 'lib/BufferGeometryUtils.js'), contentType: js });
    if (p.endsWith('.css') && (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net')) return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'cdnjs.cloudflare.com' && p.endsWith('/jszip.min.js')) return route.fulfill({ contentType: js, body: 'window.JSZip = window.JSZip || function () {};' });
    if (url.hostname === 'cdn.jsdelivr.net' && p.endsWith('/FileSaver.min.js')) return route.fulfill({ contentType: js, body: 'window.saveAs = window.saveAs || function () {};' });
    if (url.hostname === 'cdn.jsdelivr.net' && (p.includes('/postprocessing/') || p.includes('/shaders/') || p.endsWith('/SimplexNoise.js'))) return route.fulfill({ contentType: js, body: '' });
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem('voxelshaper_onboarding_dont_show', 'true');
    localStorage.setItem('vs_first_run_control_hints_done', '1');
    localStorage.removeItem('vs_control_coach_v1');
    localStorage.removeItem('voxelshaper_autosave');
  });
}

async function openEditor(page) {
  await mockDependencies(page);
  await page.goto('/');
  await page.addStyleTag({ content: '*,*::before,*::after{transition-duration:0s!important}' });
  await expect.poll(() => page.evaluate(() => Boolean(window.VoxelApp?.cam && window.VoxelControlCoach))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.getElementById('bootLoadingOverlay');
    return !overlay || getComputedStyle(overlay).pointerEvents === 'none';
  })).toBe(true);
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const app = window.VoxelApp;
    app.loadFromData({
      gridSize: 10, currentDrawingAxis: 'y', activeDrawingLevel: { x: 0, y: 0, z: 0 },
      metadata: { type: 'orbit_edit_test' }, voxels: [{ x: 5, y: 0, z: 5, color: '#FF0000' }]
    }, { preserveHistory: true, meta: { type: 'orbit_edit_test' } });
    app.setModeExplicit('FREE', 'test');
    app.setCameraControlMode('orbit', { persist: false, announce: false });
    app.resetCamera();
  });
}

async function emptyGridPoint(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const r = app.cvs.getBoundingClientRect();
    for (const [cx, cz] of [[3, 5], [4, 3], [6, 6], [2, 2], [7, 4], [3, 7]]) {
      const v = new THREE.Vector3((cx + 0.5) * app.VS, 0, (cz + 0.5) * app.VS).project(app.cam);
      const x = r.left + (v.x + 1) / 2 * r.width;
      const y = r.top + (1 - v.y) / 2 * r.height;
      const t = app.getRayTargetInfo(x, y);
      if (t && t.x === cx && t.y === 0 && t.z === cz) return { x, y };
    }
    return null;
  });
}

// Pointer gestures are dispatched straight at the canvas: the test page runs without the
// Tailwind CDN, so overlay layout is not representative for coordinate-based mouse input.
async function pointerHold(page, point, holdMs, pointerId, pointerType = 'touch') {
  await page.evaluate(async ({ point, holdMs, pointerId, pointerType }) => {
    const cvs = window.VoxelApp.cvs;
    const fire = (type) => cvs.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId, pointerType, isPrimary: true,
      clientX: point.x, clientY: point.y, button: 0, buttons: type === 'pointerup' ? 0 : 1
    }));
    fire('pointerdown');
    await new Promise((resolve) => setTimeout(resolve, holdMs));
    fire('pointerup');
  }, { point, holdMs, pointerId, pointerType });
}
const touchHold = (page, point, holdMs, pointerId) => pointerHold(page, point, holdMs, pointerId, 'touch');
const mouseHold = (page, point, holdMs, pointerId) => pointerHold(page, point, holdMs, pointerId, 'mouse');

const voxelCount = (page) => page.evaluate(() => window.VoxelApp.voxels.size);
const coachEvents = (page) => page.evaluate(() => (window.dataLayer || [])
  .map((item) => Array.from(item || []))
  .filter((args) => args[0] === 'event' && args[1] === 'control_coach_pulse')
  .map((args) => args[2] || {}));

test('mobile Orbit long-press never edits and coaches the mode switch; Edit long-press still places', async ({ browser }) => {
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page);
  expect(await page.evaluate(() => window.VoxelApp.mobileCanvasMode)).toBe('view');

  const point = await emptyGridPoint(page);
  expect(point).toBeTruthy();
  const before = await voxelCount(page);
  await touchHold(page, point, 800, 41);
  await page.waitForTimeout(150);
  expect(await voxelCount(page)).toBe(before);
  await expect.poll(async () => (await coachEvents(page)).some((e) => e.hint === 'mode_switch')).toBe(true);
  expect((await coachEvents(page)).some((e) => e.hint === 'orbit')).toBe(false);

  // Orbit + Fly camera (the old long-press placement path) also never edits.
  await page.evaluate(() => window.VoxelApp.setCameraControlMode('fly', { persist: false, announce: false }));
  await touchHold(page, point, 800, 42);
  await page.waitForTimeout(150);
  expect(await voxelCount(page)).toBe(before);
  await page.evaluate(() => window.VoxelApp.setCameraControlMode('orbit', { persist: false, announce: false }));

  // The mode switch leaves Orbit and keeps the current tool; long-press now places.
  await page.locator('#mobile-mode-toggle').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => [window.VoxelApp.mobileCanvasMode, window.VoxelApp.currentMode])).toEqual(['edit', 'FREE']);
  await touchHold(page, point, 800, 43);
  await expect.poll(() => voxelCount(page)).toBeGreaterThan(before);
  expect(errors).toEqual([]);
  await context.close();
});

test('desktop Space toggles Orbit and Edit without cycling tools, and Orbit clicks never edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page);
  expect(await page.evaluate(() => window.VoxelApp.mobileCanvasMode)).toBe('edit');
  await expect(page.locator('#desktop-orbit-stack #desktop-overlay-mode-toggle')).toHaveCount(1);
  await expect(page.locator('#desktop-orbit-stack #desktop-overlay-orbit-toggle')).toHaveCount(1);

  await page.mouse.move(720, 300);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => [window.VoxelApp.mobileCanvasMode, window.VoxelApp.currentMode])).toEqual(['view', 'FREE']);
  await expect(page.locator('#desktop-overlay-orbit-toggle')).toHaveAttribute('aria-pressed', 'true');

  const point = await emptyGridPoint(page);
  expect(point).toBeTruthy();
  const before = await voxelCount(page);
  await mouseHold(page, point, 60, 1);
  await mouseHold(page, point, 800, 1);
  await page.waitForTimeout(150);
  expect(await voxelCount(page)).toBe(before);
  await expect.poll(async () => (await coachEvents(page)).some((e) => e.hint === 'mode_switch' && e.ui_mode === 'desktop')).toBe(true);

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.VoxelApp.mobileCanvasMode)).toBe('edit');
  await mouseHold(page, point, 60, 1);
  await expect.poll(() => voxelCount(page)).toBe(before + 1);

  // Orbit button and mode switch: Orbit, then the mode switch leaves Orbit keeping the tool.
  await page.locator('#desktop-overlay-orbit-toggle').dispatchEvent('click');
  await expect(page.locator('#desktop-overlay-orbit-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#desktop-overlay-mode-toggle').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => [window.VoxelApp.mobileCanvasMode, window.VoxelApp.currentMode])).toEqual(['edit', 'FREE']);

  // Fly + Space returns to the Orbit camera and Orbit mode.
  await page.locator('#camera-control-fly').dispatchEvent('click');
  await page.mouse.move(720, 300);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => [window.VoxelApp.cameraControlMode, window.VoxelApp.mobileCanvasMode])).toEqual(['orbit', 'view']);
  expect(errors).toEqual([]);
});
