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
        body: 'window.JSZip = window.JSZip || function JSZip() {};'
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

    const meta = { type: 'floating_island', seed: 123456, shape: 44, color: 70, palette: 'auto', gridSize: 20 };
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
