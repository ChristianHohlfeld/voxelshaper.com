import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  // Visual smoke is testing the editor/Physics surface, not first-run onboarding.
  await page.addInitScript(() => localStorage.setItem('voxelshaper_onboarding_dont_show', 'true'));
});

async function dismissOnboarding(page) {
  await page.evaluate(() => {
    localStorage.setItem('voxelshaper_onboarding_dont_show', 'true');
    const modal = document.getElementById('onboardingModal');
    if (modal?.open) {
      try { modal.close(); } catch (_) { modal.removeAttribute('open'); }
    }
  });
}

async function seedModel(page) {
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true,
    null,
    { timeout: 20000 }
  );
  await dismissOnboarding(page);
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
  await page.waitForTimeout(200);
  await dismissOnboarding(page);
}

async function frameFixture(page) {
  await page.evaluate(() => {
    const app = window.VoxelApp;
    const s = app.VS || 1;
    const target = new THREE.Vector3(16 * s, 20 * s, 16 * s);
    const distance = Math.max(10 * s, 8);
    app.cam.position.set(target.x + distance, target.y + distance * .72, target.z + distance);
    app.cam.lookAt(target);
    app.cam.updateProjectionMatrix?.();
    app.cam.updateMatrixWorld?.(true);
    if (app.controls?.target) {
      app.controls.target.copy(target);
      app.controls.update?.();
      app.cam.updateMatrixWorld?.(true);
    }
  });
  await page.waitForTimeout(80);
}

async function startPhysics(page) {
  await dismissOnboarding(page);
  const play = page.locator('#vs-physics-test');
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  await play.click();
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForTimeout(100);
}

async function visibleBodyPoint(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const box = window.VoxelBox3D;
    const rect = app.cvs.getBoundingClientRect();
    const bodies = box.snapshotBodies();
    app.cam?.updateMatrixWorld?.(true);

    const tryPoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (x < rect.left + 1 || x > rect.right - 1 || y < rect.top + 1 || y > rect.bottom - 1) return null;
      if (document.elementFromPoint(x, y) !== app.cvs) return null;
      const hit = box.pickBodyAtPointer?.(x, y);
      return hit && Number.isInteger(hit.index) && hit.index >= 0 ? { x, y, index:hit.index } : null;
    };

    // Prefer the exact projected live bodies, but probe around the centre because
    // a rotated/small voxel need not be hit by its projected body origin pixel.
    const offsets = [0,-2,2,-4,4,-8,8,-12,12,-16,16,-20,20,-24,24,-32,32];
    for (let i=0;i<bodies.length;i++) {
      const b = bodies[i];
      const p = new THREE.Vector3(b.x,b.y,b.z).project(app.cam);
      const cx = rect.left + (p.x + 1) * .5 * rect.width;
      const cy = rect.top + (1 - p.y) * .5 * rect.height;
      for (const dy of offsets) {
        for (const dx of offsets) {
          const hit = tryPoint(cx + dx, cy + dy);
          if (hit) return hit;
        }
      }
    }

    // Last resort still uses a real visible canvas ray hit, never a synthetic grab.
    const step = Math.max(4, Math.min(10, Math.floor(Math.min(rect.width, rect.height) / 72) || 6));
    for (let y=rect.top + step*.5; y<rect.bottom; y+=step) {
      for (let x=rect.left + step*.5; x<rect.right; x+=step) {
        const hit = tryPoint(x, y);
        if (hit) return hit;
      }
    }
    return null;
  });
}

async function beginTouchGrab(page, from, to) {
  await page.evaluate(({from,to}) => {
    const canvas = window.VoxelApp.cvs;
    const common = {bubbles:true,cancelable:true,composed:true,pointerId:771,pointerType:'touch',isPrimary:true,button:0,buttons:1};
    canvas.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX:from.x,clientY:from.y}));
    for (let i=1;i<=10;i++) {
      const t=i/10;
      canvas.dispatchEvent(new PointerEvent('pointermove',{...common,clientX:from.x+(to.x-from.x)*t,clientY:from.y+(to.y-from.y)*t}));
    }
  }, {from,to});
  await page.waitForFunction(() => window.VoxelBox3D.mouseGrabActive === true && window.VoxelPhysicsInputRouter.dragging === true);
}

async function endTouchGrab(page, at) {
  await page.evaluate((at) => {
    const canvas = window.VoxelApp.cvs;
    canvas.dispatchEvent(new PointerEvent('pointerup',{
      bubbles:true,cancelable:true,composed:true,pointerId:771,pointerType:'touch',isPrimary:true,button:0,buttons:0,clientX:at.x,clientY:at.y
    }));
  }, at);
  await page.waitForFunction(() => !window.VoxelBox3D.mouseGrabActive && !window.VoxelPhysicsInputRouter.dragging);
}

test('desktop visual smoke', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('voxelshaper_onboarding_dont_show', 'true'));
  await page.goto(`${BASE}/?visual_ci=desktop`, { waitUntil:'domcontentloaded' });
  await seedModel(page);
  await frameFixture(page);

  expect(await page.locator('#vs-physics-toggle-desktop').count()).toBe(0);
  expect(await page.locator('#vs-physics-panel').count()).toBe(0);
  const play = await page.locator('#vs-physics-test').boundingBox();
  expect(play).not.toBeNull();
  expect(play.x).toBeLessThanOrEqual(24);
  const playHit = await page.evaluate(({x,y}) => !!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'), {
    x:play.x+play.width/2,y:play.y+play.height/2
  });
  expect(playHit).toBe(true);
  await page.screenshot({ path:'test-results/visual/desktop-idle.png', fullPage:true });

  await startPhysics(page);
  const from = await visibleBodyPoint(page);
  expect(from).not.toBeNull();
  const to = {x:from.x+125,y:from.y-55};
  await page.mouse.move(from.x,from.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.VoxelBox3D.mouseGrabActive && window.VoxelPhysicsInputRouter.dragging);
  await page.mouse.move(to.x,to.y,{steps:14});
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => window.VoxelBox3D.mouseGrabActive)).toBe(true);
  await page.screenshot({ path:'test-results/visual/desktop-grab.png', fullPage:true });
  await page.mouse.up();
  await page.waitForFunction(() => !window.VoxelBox3D.mouseGrabActive);

  await page.locator('#vs-physics-test').click();
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
  await page.screenshot({ path:'test-results/visual/desktop-reset.png', fullPage:true });
  await context.close();
});

test('mobile visual smoke', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('voxelshaper_onboarding_dont_show', 'true'));
  await page.goto(`${BASE}/?visual_ci=mobile`, { waitUntil:'domcontentloaded' });
  await seedModel(page);

  const mode = await page.locator('#mobile-canvas-mode-toggle').getAttribute('data-mode');
  expect(['view','edit']).toContain(mode);
  expect(mode).not.toBe('physics');
  const play = await page.locator('#vs-physics-test').boundingBox();
  expect(play).not.toBeNull();
  expect(play.x).toBeLessThanOrEqual(20);
  const playHit = await page.evaluate(({x,y}) => !!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'), {
    x:play.x+play.width/2,y:play.y+play.height/2
  });
  expect(playHit).toBe(true);
  await page.screenshot({ path:'test-results/visual/mobile-idle.png', fullPage:true });

  await page.touchscreen.tap(play.x + play.width/2, play.y + play.height/2);
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForTimeout(100);
  const from = await visibleBodyPoint(page);
  expect(from).not.toBeNull();
  const to = {x:Math.min(370,from.x+80),y:Math.max(80,from.y-42)};
  await beginTouchGrab(page,from,to);
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => window.VoxelBox3D.mouseGrabActive)).toBe(true);
  await page.screenshot({ path:'test-results/visual/mobile-grab.png', fullPage:true });
  await endTouchGrab(page,to);

  await page.touchscreen.tap(play.x + play.width/2, play.y + play.height/2);
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
  await page.screenshot({ path:'test-results/visual/mobile-reset.png', fullPage:true });
  await context.close();
});
