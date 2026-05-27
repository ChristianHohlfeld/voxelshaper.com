import { test, expect, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');

const animationKillSwitch = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0.001s !important;
    transition-delay: 0s !important;
    transition-duration: 0.001s !important;
    scroll-behavior: auto !important;
  }
`;

const corsHeaders = (route) => ({
  'Access-Control-Allow-Origin': route.request().headers().origin || 'http://127.0.0.1:18332',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-csrf-token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
});

const tinyProjectFor = (url) => {
  const params = url.searchParams;
  const meta = {
    type: params.get('type') || 'floating_island',
    seed: Number(params.get('seed') || 1),
    shape: Number(params.get('shape') || 60),
    color: Number(params.get('color') || 80),
    palette: params.get('palette') || 'auto',
    gridSize: Number(params.get('gridSize') || 20),
    maxVoxels: Number(params.get('maxVoxels') || 9000)
  };
  return {
    ok: true,
    metadata: meta,
    voxel_count: 4,
    budget_hit: false,
    project: {
      gridSize: 20,
      currentDrawingAxis: 'y',
      activeDrawingLevel: { x: 0, y: 0, z: 0 },
      metadata: meta,
      voxels: [
        { x: 14, y: 0, z: 14, color: '#58E1FF' },
        { x: 15, y: 0, z: 14, color: '#58E1FF' },
        { x: 14, y: 1, z: 14, color: '#95A3B3' },
        { x: 15, y: 1, z: 14, color: '#95A3B3' }
      ]
    }
  };
};

async function fulfillLocalScript(route, filePath) {
  await route.fulfill({ path: filePath, contentType: 'application/javascript; charset=utf-8' });
}

async function mockBrowserDependencies(page, options = {}) {
  await page.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    const url = new URL(requestUrl);
    const pathname = url.pathname;

    if (url.hostname === 'api.voxelshaper.com') {
      if (pathname === '/api/user/me' && options.user) {
        await route.fulfill({
          status: 200,
          headers: {
            ...corsHeaders(route),
            'X-VoxelShaper-License-Tier': options.user.license?.tier || 'free'
          },
          contentType: 'application/json',
          body: JSON.stringify(options.user)
        });
        return;
      }

      if (pathname.startsWith('/api/generate')) {
        if (options.generateFailure) {
          await route.fulfill({
            status: 500,
            headers: corsHeaders(route),
            contentType: 'application/json',
            body: JSON.stringify({ error: 'test generate failure' })
          });
          return;
        }
        options.onGenerateRequest?.(url);
        await route.fulfill({
          status: 200,
          headers: corsHeaders(route),
          contentType: 'application/json',
          body: JSON.stringify(tinyProjectFor(url))
        });
        return;
      }

      await route.fulfill({
        status: 401,
        headers: corsHeaders(route),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'no session' })
      });
      return;
    }

    if (url.hostname === 'www.googletagmanager.com') {
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: '' });
      return;
    }

    if (url.hostname === 'www.google-analytics.com') {
      await route.fulfill({ contentType: 'text/plain; charset=utf-8', body: '' });
      return;
    }

    if (url.hostname === 'cdn.tailwindcss.com') {
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: '' });
      return;
    }

    if (url.hostname === 'cdn.jsdelivr.net' && pathname.endsWith('/three.min.js')) {
      await fulfillLocalScript(route, path.join(appRoot, 'lib/three.min.js'));
      return;
    }

    if (url.hostname === 'cdn.jsdelivr.net' && pathname.endsWith('/STLExporter.js')) {
      await fulfillLocalScript(route, path.join(appRoot, 'lib/STLExporter.js'));
      return;
    }

    if (url.hostname === 'cdn.jsdelivr.net' && pathname.endsWith('/BufferGeometryUtils.js')) {
      await fulfillLocalScript(route, path.join(appRoot, 'lib/BufferGeometryUtils.js'));
      return;
    }

    if (url.hostname === 'cdnjs.cloudflare.com' && pathname.endsWith('/jszip.min.js')) {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.JSZip = window.JSZip || function JSZip() {
            const root = { files: [] };
            const makeFolder = (prefix) => ({
              file(name, content) { root.files.push(prefix + name); return this; },
              folder(name) { return makeFolder(prefix + name + '/'); }
            });
            return {
              file(name, content) { root.files.push(name); return this; },
              folder(name) { return makeFolder(name + '/'); },
              generateAsync() {
                return Promise.resolve(new Blob(['fake-3mf:' + root.files.join('|')], { type: 'application/octet-stream' }));
              }
            };
          };
        `
      });
      return;
    }

    if (url.hostname === 'cdn.jsdelivr.net' && pathname.endsWith('/FileSaver.min.js')) {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: 'window.saveAs = window.saveAs || function saveAs() {};'
      });
      return;
    }

    if (
      url.hostname === 'cdnjs.cloudflare.com' && pathname.endsWith('.css') ||
      url.hostname === 'cdn.jsdelivr.net' && pathname.endsWith('.css')
    ) {
      await route.fulfill({ contentType: 'text/css; charset=utf-8', body: '' });
      return;
    }

    if (
      url.hostname === 'cdn.jsdelivr.net' &&
      (pathname.includes('/postprocessing/') || pathname.includes('/shaders/') || pathname.endsWith('/SimplexNoise.js'))
    ) {
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: '' });
      return;
    }

    if (url.hostname === 'unpkg.com') {
      await route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: '' });
      return;
    }

    await route.continue();
  });
}

async function makeFirstRun(page, showOnboarding = true) {
  await page.addInitScript((shouldShow) => {
    localStorage.removeItem('voxelshaper_autosave');
    localStorage.removeItem('deleteBrushHintDisabled');
    localStorage.removeItem('voxelCameraControlMode');
    sessionStorage.clear();
    if (shouldShow) {
      localStorage.removeItem('voxelshaper_onboarding_dont_show');
    } else {
      localStorage.setItem('voxelshaper_onboarding_dont_show', 'true');
    }
  }, showOnboarding);
}

async function installStableUi(page) {
  await page.addStyleTag({ content: animationKillSwitch });
}

async function getEvents(page) {
  return page.evaluate(() => (window.dataLayer || [])
    .map((item) => Array.from(item || []))
    .filter((args) => args[0] === 'event')
    .map((args) => ({ name: args[1], params: args[2] || {} })));
}

async function waitForEvent(page, name, predicate = () => true) {
  await expect.poll(async () => {
    const events = await getEvents(page);
    return events.some((event) => event.name === name && predicate(event.params));
  }).toBe(true);
}

function encodeHubMeta(meta) {
  return Buffer.from(JSON.stringify(meta), 'utf8').toString('base64');
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function waitForVoxelApp(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.VoxelApp?.cam && window.VoxelApp?.cvs))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.getElementById('bootLoadingOverlay');
    return !overlay || getComputedStyle(overlay).pointerEvents === 'none';
  })).toBe(true);
}

async function getCameraPosition(page) {
  return page.evaluate(() => {
    const p = window.VoxelApp.cam.position;
    return [p.x, p.y, p.z];
  });
}

async function projectWorldToPage(page, { x, y, z }) {
  return page.evaluate((point) => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    const projected = new window.THREE.Vector3(point.x, point.y, point.z).project(app.cam);
    return {
      x: rect.left + ((projected.x + 1) * 0.5 * rect.width),
      y: rect.top + ((1 - projected.y) * 0.5 * rect.height)
    };
  }, { x, y, z });
}

async function findScreenPointForTarget(page, { x, y, z, radius = 70 } = {}) {
  return page.evaluate((desired) => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    const isReachableCanvasPoint = (point) => {
      if (point.x < rect.left + 2 || point.x > rect.right - 2) return false;
      if (point.y < rect.top + 2 || point.y > rect.bottom - 2) return false;
      if (point.x < 2 || point.x > window.innerWidth - 2) return false;
      if (point.y < 2 || point.y > window.innerHeight - 2) return false;
      return document.elementFromPoint(point.x, point.y) === app.cvs;
    };
    const projected = new window.THREE.Vector3(desired.x + 0.5, desired.y, desired.z + 0.5).project(app.cam);
    const center = {
      x: rect.left + ((projected.x + 1) * 0.5 * rect.width),
      y: rect.top + ((1 - projected.y) * 0.5 * rect.height)
    };
    const candidates = [center];
    for (let r = 4; r <= desired.radius; r += 4) {
      for (const dx of [-r, 0, r]) {
        for (const dy of [-r, 0, r]) {
          candidates.push({ x: center.x + dx, y: center.y + dy });
        }
      }
    }
    return candidates.find((point) => {
      if (!isReachableCanvasPoint(point)) return false;
      const target = app.getRayTargetInfo(point.x, point.y);
      return target && target.x === desired.x && target.y === desired.y && target.z === desired.z;
    }) || null;
  }, { x, y, z, radius });
}

async function findEditableGridPoint(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    const left = Math.max(rect.left + 8, 8);
    const right = Math.min(rect.right - 8, window.innerWidth - 8);
    const top = Math.max(rect.top + 8, 8);
    const bottom = Math.min(rect.bottom - 8, window.innerHeight - 8);
    const candidates = [];

    for (let yi = 0; yi <= 20; yi++) {
      for (let xi = 0; xi <= 26; xi++) {
        const point = {
          x: left + ((right - left) * xi / 26),
          y: top + ((bottom - top) * yi / 20)
        };
        if (document.elementFromPoint(point.x, point.y) !== app.cvs) continue;
        const target = app.getRayTargetInfo(point.x, point.y);
        if (!target) continue;
        if (target.x < 0 || target.x >= app.GRID || target.y < 0 || target.y >= app.GRID || target.z < 0 || target.z >= app.GRID) continue;
        const centerBias = Math.hypot(point.x - (left + right) / 2, point.y - (top + bottom) / 2);
        candidates.push({
          x: point.x,
          y: point.y,
          target: { x: target.x, y: target.y, z: target.z, source: target.source || 'mesh' },
          score: centerBias
        });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || null;
  });
}

async function findEditableGridDrag(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    const left = Math.max(rect.left + 10, 10);
    const right = Math.min(rect.right - 10, window.innerWidth - 10);
    const top = Math.max(rect.top + 10, 10);
    const bottom = Math.min(rect.bottom - 10, window.innerHeight - 10);
    const candidates = [];

    for (let yi = 0; yi <= 18; yi++) {
      for (let xi = 0; xi <= 30; xi++) {
        const x = left + ((right - left) * xi / 30);
        const y = top + ((bottom - top) * yi / 18);
        if (document.elementFromPoint(x, y) !== app.cvs) continue;
        const target = app.getRayTargetInfo(x, y);
        if (!target) continue;
        if (target.x < 0 || target.x >= app.GRID || target.y < 0 || target.y >= app.GRID || target.z < 0 || target.z >= app.GRID) continue;
        candidates.push({ x, y, target: { x: target.x, y: target.y, z: target.z } });
      }
    }

    let best = null;
    let bestScore = -Infinity;
    for (const start of candidates) {
      for (const end of candidates) {
        const screenDistance = Math.hypot(end.x - start.x, end.y - start.y);
        const gridDistance = Math.abs(end.target.x - start.target.x) + Math.abs(end.target.y - start.target.y) + Math.abs(end.target.z - start.target.z);
        if (screenDistance < 120 || gridDistance < 3) continue;
        const score = gridDistance * 1000 + screenDistance;
        if (score > bestScore) {
          bestScore = score;
          best = { start, end };
        }
      }
    }
    return best;
  });
}

async function findVisibleVoxelPoint(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    const left = Math.max(rect.left + 8, 8);
    const right = Math.min(rect.right - 8, window.innerWidth - 8);
    const top = Math.max(rect.top + 8, 8);
    const bottom = Math.min(rect.bottom - 8, window.innerHeight - 8);

    for (let yi = 0; yi <= 24; yi++) {
      for (let xi = 0; xi <= 30; xi++) {
        const point = {
          x: left + ((right - left) * xi / 30),
          y: top + ((bottom - top) * yi / 24)
        };
        if (document.elementFromPoint(point.x, point.y) !== app.cvs) continue;
        const target = app.getRayTargetInfo(point.x, point.y);
        if (target && app.voxels.has(app.key(target.x, target.y, target.z))) return point;
      }
    }
    return null;
  });
}

async function prepareEmptyFreeBuildScene(page, cameraMode = 'orbit') {
  await page.evaluate((mode) => {
    const app = window.VoxelApp;
    app.loadFromData({
      gridSize: 10,
      currentDrawingAxis: 'y',
      activeDrawingLevel: { x: 0, y: 0, z: 0 },
      metadata: { type: 'test_empty_grid' },
      voxels: []
    }, { preserveHistory: true, meta: { type: 'test_empty_grid' } });
    app.setModeExplicit('FREE', 'test');
    app.setCameraControlMode(mode, { persist: false, announce: false });
    app.currentDrawingAxis = 'y';
    app.activeDrawingLevel = { x: 0, y: 0, z: 0 };
    app._lastPreviewRayAt = 0;
    app._lastPreviewClientX = null;
    app._lastPreviewClientY = null;
    app.rebuildHelpers();
    app.resetCamera();
  }, cameraMode);
}

async function sampleCanvasCenterPixels(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    app.ren.render(app.scene, app.cam);
    const gl = app.ren.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixel = new Uint8Array(4);
    let nonBlank = 0;
    for (let yi = 0; yi < 9; yi++) {
      for (let xi = 0; xi < 9; xi++) {
        const x = Math.max(0, Math.min(width - 1, Math.round(width * (0.30 + xi * 0.05))));
        const y = Math.max(0, Math.min(height - 1, Math.round(height * (0.30 + yi * 0.05))));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel[3] > 8 && (pixel[0] + pixel[1] + pixel[2]) > 20) nonBlank++;
      }
    }
    return { width, height, nonBlank };
  });
}

function vectorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function dragCanvas(page, { button = 'left', from = [0.26, 0.36], to = [0.46, 0.40] } = {}) {
  const box = await page.locator('#voxelCanvas').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down({ button });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await page.mouse.up({ button });
}

async function findOrbitBackgroundDrag(page) {
  const box = await page.locator('#voxelCanvas').boundingBox();
  expect(box).toBeTruthy();
  const selected = await page.evaluate((rect) => {
    const app = window.VoxelApp;
    for (const yRatio of [0.08, 0.14, 0.22, 0.78, 0.86, 0.92]) {
      for (const xRatio of [0.06, 0.12, 0.20, 0.80, 0.88, 0.94]) {
        const x = rect.x + rect.width * xRatio;
        const y = rect.y + rect.height * yRatio;
        if (!app.getRayTargetInfo(x, y)) {
          const toX = xRatio < 0.5 ? Math.min(0.96, xRatio + 0.14) : Math.max(0.04, xRatio - 0.14);
          const toY = yRatio < 0.5 ? Math.min(0.96, yRatio + 0.08) : Math.max(0.04, yRatio - 0.08);
          return { from: [xRatio, yRatio], to: [toX, toY] };
        }
      }
    }
    return null;
  }, box);
  expect(selected).toBeTruthy();
  return selected;
}

async function installPointerLockSpy(page) {
  await page.addInitScript(() => {
    window.__pointerLockRequested = 0;
    Element.prototype.requestPointerLock = function requestPointerLockSpy() {
      window.__pointerLockRequested = (window.__pointerLockRequested || 0) + 1;
    };
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`first-run modal close button closes reliably on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, true);

    await page.goto(appPath);
    await installStableUi(page);

    await expect.poll(() => page.evaluate(() => document.getElementById('onboardingModal')?.open === true)).toBe(true);

    const dialog = page.locator('#onboardingModal');
    const close = dialog.locator('.modal-close-x').first();
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('type', 'button');
    await expect(close).toHaveAttribute('data-modal-close', 'true');
    await expect(dialog).toHaveAttribute('data-modal-close-bound', 'true');

    await close.click();

    await expect.poll(() => page.evaluate(() => document.getElementById('onboardingModal')?.open === false)).toBe(true);
    await waitForEvent(page, 'app_onboarding_dismiss');
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`all modal x buttons close their owning dialog on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);

    await expect.poll(() => page.evaluate(() =>
      document.querySelectorAll('dialog.modal[data-modal-close-bound="true"]').length
    )).toBeGreaterThan(0);

    const dialogIds = await page.evaluate(() => Array.from(document.querySelectorAll('dialog.modal')).map((dialog, index) => {
      if (!dialog.id) dialog.id = `test-dialog-${index}`;
      return dialog.id;
    }));

    for (const dialogId of dialogIds) {
      await page.evaluate((id) => {
        document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
        document.getElementById(id)?.showModal();
      }, dialogId);

      await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.open === true, dialogId)).toBe(true);

      const close = page.locator('dialog[open] .modal-close-x').first();
      await expect(close).toBeVisible();
      await expect(close).toHaveAttribute('data-modal-close', 'true');
      await close.click();

      await expect.poll(() => page.evaluate((id) => document.getElementById(id)?.open === false, dialogId)).toBe(true);
    }

    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`editor render quality baseline matches the Hub promise on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);

    const state = await page.evaluate(() => {
      const app = window.VoxelApp;
      const gridMaterial = Array.isArray(app.gridHelper.material) ? app.gridHelper.material[0] : app.gridHelper.material;
      return {
        fov: app.cam.fov,
        lowPerfMode: app.lowPerfMode,
        shadowLimit: app.EDITOR_SHADOW_VOXEL_LIMIT,
        desktopBudget: app.GENERATOR_VOXEL_BUDGET_DESKTOP,
        toneMapped: app.ren.toneMapping === window.THREE.ACESFilmicToneMapping,
        exposure: app.ren.toneMappingExposure,
        keyShadowSize: app.keyLight?.shadow?.mapSize?.width || 0,
        gridOpacity: gridMaterial?.opacity,
        boxOpacity: app.boxHelper?.material?.opacity,
        ssaoValue: document.getElementById('ssaoIntensitySlider')?.value,
        fxaaDefault: document.getElementById('fxaaToggle')?.checked,
        pixelRatioCap: app.getDevicePixelRatioCap(),
        profileType: app.renderMaterialProfile?.type,
        glowReady: !!app.dynamicGlow,
        desktopSaveStyle: (() => {
          const el = document.getElementById('desktop-overlay-save');
          const cs = el ? getComputedStyle(el) : null;
          return cs ? { color: cs.color, backgroundImage: cs.backgroundImage, backgroundColor: cs.backgroundColor } : null;
        })()
      };
    });

    expect(state.fov).toBe(45);
    expect(state.shadowLimit).toBeGreaterThanOrEqual(state.desktopBudget);
    expect(state.toneMapped).toBe(true);
    expect(state.exposure).toBeCloseTo(0.96, 2);
    expect(state.keyShadowSize).toBeGreaterThanOrEqual(state.lowPerfMode ? 1024 : 2048);
    expect(state.gridOpacity).toBeLessThanOrEqual(0.22);
    expect(state.boxOpacity).toBeLessThanOrEqual(0.25);
    expect(state.ssaoValue).toBe('0.014');
    expect(state.fxaaDefault).toBe(false);
    expect(state.pixelRatioCap).toBe(2);
    expect(state.profileType).toBe('default');
    expect(state.glowReady).toBe(true);
    expect(state.desktopSaveStyle?.color).toBe('rgb(255, 255, 255)');
    expect(state.desktopSaveStyle?.backgroundImage).toContain('linear-gradient');
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`camera controls default to orbit while fly remains opt-in on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await installPointerLockSpy(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);

    await expect(page.locator('#cameraControlSwitch')).toBeVisible();
    await expect(page.locator('#camera-control-orbit')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#camera-control-fly')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => window.VoxelApp.cameraControlMode)).toBe('orbit');
    await expect.poll(() => page.evaluate(() => document.body.dataset.cameraControlMode)).toBe('orbit');

    await dragCanvas(page, { button: 'right', from: [0.42, 0.38], to: [0.50, 0.42] });
    expect(await page.evaluate(() => window.__pointerLockRequested)).toBe(0);

    await page.locator('#camera-control-fly').click();
    await expect(page.locator('#camera-control-orbit')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#camera-control-fly')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('voxelCameraControlMode'))).toBe('fly');

    await dragCanvas(page, { button: 'right', from: [0.44, 0.38], to: [0.48, 0.42] });
    expect(await page.evaluate(() => window.__pointerLockRequested)).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`orbit drag moves the camera without entering fly controls on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await installPointerLockSpy(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);

    const before = await getCameraPosition(page);
    await dragCanvas(page, await findOrbitBackgroundDrag(page));
    const after = await getCameraPosition(page);

    expect(vectorDistance(before, after)).toBeGreaterThan(0.1);
    await expect.poll(() => page.evaluate(() => window.VoxelApp.cameraControlMode)).toBe('orbit');
    expect(await page.evaluate(() => window.__pointerLockRequested)).toBe(0);
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  for (const cameraMode of ['orbit', 'fly']) {
    test(`free mode previews and places an empty grid cell in ${cameraMode} camera on ${appPath}`, async ({ page }) => {
      const pageErrors = collectPageErrors(page);
      await installPointerLockSpy(page);
      await mockBrowserDependencies(page);
      await makeFirstRun(page, false);

      await page.goto(appPath);
      await installStableUi(page);
      await waitForVoxelApp(page);
      await prepareEmptyFreeBuildScene(page, cameraMode);

      const target = await findScreenPointForTarget(page, { x: 5, y: 0, z: 5 }) || await findEditableGridPoint(page);
      expect(target).toBeTruthy();
      const rayTarget = await page.evaluate(({ x, y }) => {
        const targetInfo = window.VoxelApp.getRayTargetInfo(x, y);
        return targetInfo ? { x: targetInfo.x, y: targetInfo.y, z: targetInfo.z, source: targetInfo.source || 'mesh' } : null;
      }, target);
      expect(rayTarget).toBeTruthy();
      const expectedPreview = `${(rayTarget.x + 0.5).toFixed(1)},${(rayTarget.y + 0.5).toFixed(1)},${(rayTarget.z + 0.5).toFixed(1)}`;

      await page.mouse.move(target.x - 80, target.y - 80);
      await page.mouse.move(target.x, target.y, { steps: 4 });
      await expect.poll(() => page.evaluate(() => {
        const app = window.VoxelApp;
        const p = app.previewVoxel.position;
        return app.previewVoxel.visible ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` : 'hidden';
      })).toBe(expectedPreview);

      const beforeCamera = await getCameraPosition(page);
      await page.mouse.click(target.x, target.y);

      const expectedCoords = rayTarget;
      await expect.poll(() => page.evaluate((targetCoords) => {
        const app = window.VoxelApp;
        return app.voxels.has(app.key(targetCoords.x, targetCoords.y, targetCoords.z));
      }, expectedCoords)).toBe(true);
      expect(vectorDistance(beforeCamera, await getCameraPosition(page))).toBeLessThan(0.01);
      expect(await page.evaluate(() => window.__pointerLockRequested)).toBe(0);
      expect(pageErrors).toEqual([]);
    });
  }
}

for (const appPath of ['/', '/www/index.html']) {
  test(`orbit free-drag draws across empty grid without moving the camera on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await installPointerLockSpy(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);
    await prepareEmptyFreeBuildScene(page, 'orbit');

    const drag = await findEditableGridDrag(page);
    expect(drag).toBeTruthy();
    const { start, end } = drag;
    const beforeCamera = await getCameraPosition(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t);
      await page.waitForTimeout(45);
    }
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => window.VoxelApp.voxels.size)).toBeGreaterThanOrEqual(2);
    expect(vectorDistance(beforeCamera, await getCameraPosition(page))).toBeLessThan(0.03);
    expect(await page.evaluate(() => window.__pointerLockRequested)).toBe(0);
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`stationary delete hold removes only one voxel on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);

    await page.evaluate(() => {
      const app = window.VoxelApp;
      app.loadFromData({
        gridSize: 10,
        currentDrawingAxis: 'y',
        activeDrawingLevel: { x: 0, y: 0, z: 0 },
        metadata: { type: 'delete_hold_test' },
        voxels: [
          { x: 5, y: 0, z: 5, color: '#FF0000' },
          { x: 5, y: 1, z: 5, color: '#00FF00' },
          { x: 5, y: 2, z: 5, color: '#0000FF' }
        ]
      }, { preserveHistory: true, meta: { type: 'delete_hold_test' } });
      app.setModeExplicit('DELETE', 'test');
      app.setCameraControlMode('orbit', { persist: false, announce: false });
      app.resetCamera();
    });
    const target = await findVisibleVoxelPoint(page);
    expect(target).toBeTruthy();

    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => window.VoxelApp.voxels.size)).toBe(2);
    expect(pageErrors).toEqual([]);
  });
}

test('mobile first-start camera controls expose orbit and one-finger drag orbits', async ({ browser }) => {
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  await mockBrowserDependencies(page);
  await makeFirstRun(page, false);

  await page.goto('/www/index.html');
  await installStableUi(page);
  await waitForVoxelApp(page);

  await expect(page.locator('#cameraControlSwitch')).toBeVisible();
  await expect(page.locator('#camera-control-orbit')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.VoxelApp.isMobile)).toBe(true);

  const before = await getCameraPosition(page);
  await dragCanvas(page, await findOrbitBackgroundDrag(page));
  const after = await getCameraPosition(page);

  expect(vectorDistance(before, after)).toBeGreaterThan(0.1);
  expect(pageErrors).toEqual([]);
  await context.close();
});

for (const appPath of ['/', '/www/index.html']) {
  test(`signed-in user area shows the personal license tier on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page, {
      user: {
        id: 12,
        name: 'Chris',
        email: 'chris@example.com',
        role: 'user',
        isAdmin: false,
        license: {
          tier: 'free',
          status: 'active',
          keyPreview: 'VS-PER...7K2Q',
          key: 'VS-PER-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-7K2Q'
        }
      }
    });
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);

    await expect.poll(() => page.evaluate(() => window.__voxelshaper_user?.license?.tier)).toBe('free');
    await expect(page.locator('#userIdDisplay')).toContainText('Chris');
    await expect(page.locator('#userIdDisplay')).toContainText('FREE license');
    await expect(page.locator('#userIdDisplay .badge')).toHaveAttribute('title', /VS-PER-/);
    expect(pageErrors).toEqual([]);
  });
}

const importCases = [
  { name: 'desktop root', appPath: '/', context: { viewport: { width: 1280, height: 900 } }, expectedMaxVoxels: '4000' },
  { name: 'mobile www', appPath: '/www/index.html', context: devices['iPhone 13'], expectedMaxVoxels: '4000' }
];

for (const importCase of importCases) {
  test(`hub launch calls generate API and imports model on ${importCase.name}`, async ({ browser }) => {
    const context = await browser.newContext(importCase.context);
    const page = await context.newPage();
    const pageErrors = collectPageErrors(page);
    const generateUrls = [];
    await mockBrowserDependencies(page, {
      onGenerateRequest: (url) => generateUrls.push(url)
    });
    await makeFirstRun(page, false);

    const meta = { type: 'spaceship', seed: 123456, shape: 44, color: 70, palette: 'auto', gridSize: 20 };
    await page.goto(`${importCase.appPath}?from=hub&handoff=test-handoff&m=${encodeURIComponent(encodeHubMeta(meta))}`);
    await installStableUi(page);

    await expect.poll(() => generateUrls.length).toBe(1);
    expect(generateUrls[0].pathname).toBe('/api/generate');
    expect(generateUrls[0].searchParams.get('type')).toBe(meta.type);
    expect(generateUrls[0].searchParams.get('seed')).toBe(String(meta.seed));
    expect(generateUrls[0].searchParams.get('gridSize')).toBe(String(meta.gridSize));
    expect(generateUrls[0].searchParams.get('maxVoxels')).toBe(importCase.expectedMaxVoxels);

    await waitForEvent(page, 'app_hub_import_success', (params) =>
      params.handoff_method === 'api_generate' &&
      params.model_type === meta.type &&
      params.voxel_count === 4
    );

    const renderState = await page.evaluate(() => {
      const app = window.VoxelApp;
      const mesh = app.originalVoxelsGroup.children.find((child) => child.isMesh && child.material);
      return {
        profileType: app.renderMaterialProfile?.type,
        profileMetalness: app.renderMaterialProfile?.metalness,
        materialMetalness: mesh?.material?.metalness,
        materialColor: mesh?.material?.color?.getHexString()?.toUpperCase(),
        fov: app.cam.fov,
        glowIntensity: app.dynamicGlow?.intensity || 0,
        shadowLimit: app.EDITOR_SHADOW_VOXEL_LIMIT,
        desktopBudget: app.GENERATOR_VOXEL_BUDGET_DESKTOP
      };
    });
    expect(renderState.profileType).toBe(meta.type);
    expect(renderState.profileMetalness).toBeGreaterThanOrEqual(0.35);
    expect(renderState.materialMetalness).toBeGreaterThanOrEqual(0.35);
    expect(renderState.materialColor).toBe('58E1FF');
    expect(renderState.fov).toBe(45);
    expect(renderState.glowIntensity).toBeGreaterThan(0);
    expect(renderState.shadowLimit).toBeGreaterThanOrEqual(renderState.desktopBudget);

    const canvasPixels = await sampleCanvasCenterPixels(page);
    expect(canvasPixels.width).toBeGreaterThan(0);
    expect(canvasPixels.height).toBeGreaterThan(0);
    expect(canvasPixels.nonBlank).toBeGreaterThan(0);

    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.has('handoff')).toBe(false);
    expect(currentUrl.searchParams.has('m')).toBe(true);

    await page.evaluate(() => window.trackEvent('legacy_source_test', { source: 'legacy_cta' }));
    await waitForEvent(page, 'legacy_source_test', (params) => params.interaction_source === 'legacy_cta');

    const events = await getEvents(page);
    const pageView = events.find((event) => event.name === 'page_view');
    expect(pageView?.params?.page_path_query).toContain('handoff=1');
    expect(pageView?.params?.page_path_query).toContain('m=1');
    expect(events.some((event) => Object.prototype.hasOwnProperty.call(event.params || {}, 'source'))).toBe(false);
    expect(pageErrors).toEqual([]);
    await context.close();
  });
}

test('hub launch reload restores edited autosave instead of regenerating', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  const generateUrls = [];
  await mockBrowserDependencies(page, {
    onGenerateRequest: (url) => generateUrls.push(url)
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__autosave_reload_test_initialized')) {
      localStorage.removeItem('voxelshaper_autosave');
      sessionStorage.setItem('__autosave_reload_test_initialized', 'true');
    }
    localStorage.setItem('voxelshaper_onboarding_dont_show', 'true');
  });

  const meta = { type: 'spaceship', seed: 999, shape: 44, color: 70, palette: 'auto', gridSize: 20 };
  await page.goto(`/?from=hub&handoff=autosave&m=${encodeURIComponent(encodeHubMeta(meta))}`);
  await installStableUi(page);
  await waitForVoxelApp(page);
  await expect.poll(() => generateUrls.length).toBe(1);

  await page.evaluate(() => {
    const app = window.VoxelApp;
    app.currentColor = '#FF00AA';
    app.currentStroke = new Map();
    app.modifyVoxel(4, 0, 4, new window.THREE.Vector3(0, 1, 0), 'ADD');
    app.commitCurrentStroke();
  });
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('voxelshaper_autosave') || '{}');
    return saved.voxels?.some((v) => v.x === 4 && v.y === 0 && v.z === 4 && v.color === '#FF00AA');
  })).toBe(true);

  await page.reload();
  await installStableUi(page);
  await waitForVoxelApp(page);

  await expect.poll(() => generateUrls.length).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const app = window.VoxelApp;
    const voxel = app.voxels.get(app.key(4, 0, 4));
    return voxel?.color || null;
  })).toBe('#FF00AA');
  await waitForEvent(page, 'app_hub_import_success', (params) => params.handoff_method === 'autosave_restore');
  expect(pageErrors).toEqual([]);
});

for (const appPath of ['/', '/www/index.html']) {
  test(`morph generator button imports the same API payload as Hub on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    const generateUrls = [];
    await mockBrowserDependencies(page, {
      onGenerateRequest: (url) => generateUrls.push(url)
    });
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);
    await page.evaluate(() => {
      window.VoxelApp.morphSettings = { type: 'spaceship', seed: 4242, shape: 51, color: 73, palette: 'auto' };
    });

    await page.evaluate(() => window.VoxelApp.openHubGenerator());

    await expect.poll(() => generateUrls.length).toBe(1);
    expect(generateUrls[0].pathname).toBe('/api/generate');
    expect(generateUrls[0].searchParams.get('type')).toBe('spaceship');
    expect(generateUrls[0].searchParams.get('seed')).toBe('4242');
    await expect.poll(() => page.evaluate(() => window.VoxelApp.currentModelMeta?.seed)).toBe(4242);
    await expect.poll(() => page.evaluate(() => {
      const app = window.VoxelApp;
      return app.originalVoxelsGroup.children.some((child) => child.material?.color?.getHexString()?.toUpperCase() === '58E1FF');
    })).toBe(true);
    await waitForEvent(page, 'app_hub_generate_in_editor', (params) =>
      params.handoff_method === 'api_generate' &&
      params.type === 'spaceship' &&
      params.voxel_count === 4
    );
    expect(pageErrors).toEqual([]);
  });
}

for (const appPath of ['/', '/www/index.html']) {
  test(`desktop print button downloads a 3MF file on ${appPath}`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await mockBrowserDependencies(page);
    await makeFirstRun(page, false);

    await page.goto(appPath);
    await installStableUi(page);
    await waitForVoxelApp(page);
    await page.evaluate(() => {
      window.__savedFiles = [];
      window.saveAs = (blob, name) => {
        window.__savedFiles.push({ name, size: blob?.size || 0, type: blob?.type || '' });
      };
      window.VoxelApp.loadFromData({
        gridSize: 10,
        currentDrawingAxis: 'y',
        activeDrawingLevel: { x: 0, y: 0, z: 0 },
        metadata: { type: 'print_test' },
        voxels: [{ x: 1, y: 0, z: 1, color: '#58E1FF' }]
      }, { preserveHistory: true, meta: { type: 'print_test' } });
    });

    await expect(page.locator('#desktop-overlay-print-now')).toBeVisible();
    await page.locator('#desktop-overlay-print-now').click();

    await expect.poll(() => page.evaluate(() => window.__savedFiles?.length || 0)).toBe(1);
    const saved = await page.evaluate(() => window.__savedFiles[0]);
    expect(saved.name.endsWith('.3mf')).toBe(true);
    expect(saved.size).toBeGreaterThan(0);
    await waitForEvent(page, 'print_now_click', (params) => params.format === '3mf_bambu');
    expect(pageErrors).toEqual([]);
  });
}

test('hub launch falls back to client generation when the API is unavailable', async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await mockBrowserDependencies(page, { generateFailure: true });
  await makeFirstRun(page, false);

  const meta = { type: 'castle', seed: 77, shape: 50, color: 60, palette: 'auto' };
  await page.goto(`/?from=hub&handoff=broken-api&m=${encodeURIComponent(encodeHubMeta(meta))}`);
  await installStableUi(page);

  await waitForEvent(page, 'app_hub_import_failed', (params) =>
    params.handoff_method === 'api_generate' &&
    params.reason === 'api_failed' &&
    params.model_type === meta.type
  );
  await waitForEvent(page, 'app_hub_import_success', (params) =>
    params.handoff_method === 'client_fallback' &&
    params.model_type === meta.type &&
    params.voxel_count > 0
  );

  expect(pageErrors).toEqual([]);
});
