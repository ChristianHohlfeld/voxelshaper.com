import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function seedModel(page) {
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true,
    null,
    { timeout: 20000 }
  );
  await page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled = false;
    window.VoxelPhysics.state.running = false;
    app.voxels.clear();
    const c = [16, 18, 16];
    const colors = ['#22D3EE','#F59E0B','#A78BFA','#34D399','#FB7185','#F8FAFC'];
    let i = 0;
    for (let y=0;y<5;y++) {
      for (let x=-2;x<=2;x++) {
        for (let z=-1;z<=1;z++) {
          if ((Math.abs(x)+Math.abs(z)+y)%2===0 || y<2) {
            app.voxels.set(app.key(c[0]+x,c[1]+y,c[2]+z), { color: colors[i++%colors.length], glass:false });
          }
        }
      }
    }
    app.updateInstancedVoxels?.();
    app.resetCameraPosition?.();
  });
  await page.waitForTimeout(250);
}

async function startPhysics(page) {
  await page.locator('#vs-physics-test').click();
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForTimeout(550);
}

test('desktop visual smoke', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/?visual_ci=desktop`, { waitUntil:'domcontentloaded' });
  await seedModel(page);

  expect(await page.locator('#vs-physics-toggle-desktop').count()).toBe(0);
  expect(await page.locator('#vs-physics-panel').count()).toBe(0);
  await page.screenshot({ path:'test-results/visual/desktop-idle.png', fullPage:true });

  await startPhysics(page);
  await page.evaluate(() => window.VoxelBox3D.applyForce(250, 80, -180, 1));
  await page.waitForTimeout(450);
  await page.screenshot({ path:'test-results/visual/desktop-running.png', fullPage:true });

  await page.locator('#vs-physics-test').click();
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
  await page.screenshot({ path:'test-results/visual/desktop-reset.png', fullPage:true });
  await context.close();
});

test('mobile visual smoke', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  await page.goto(`${BASE}/?visual_ci=mobile`, { waitUntil:'domcontentloaded' });
  await seedModel(page);

  const mode = await page.locator('#mobile-canvas-mode-toggle').getAttribute('data-mode');
  expect(['view','edit']).toContain(mode);
  expect(mode).not.toBe('physics');
  await page.screenshot({ path:'test-results/visual/mobile-idle.png', fullPage:true });

  const play = await page.locator('#vs-physics-test').boundingBox();
  expect(play).not.toBeNull();
  expect(play.x).toBeLessThanOrEqual(20);
  await page.touchscreen.tap(play.x + play.width/2, play.y + play.height/2);
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.evaluate(() => window.VoxelBox3D.applyForce(180, 100, -120, 1));
  await page.waitForTimeout(600);
  await page.screenshot({ path:'test-results/visual/mobile-running.png', fullPage:true });

  await page.touchscreen.tap(play.x + play.width/2, play.y + play.height/2);
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
  await page.screenshot({ path:'test-results/visual/mobile-reset.png', fullPage:true });
  await context.close();
});
