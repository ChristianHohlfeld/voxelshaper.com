import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function mobilePage(browser) {
  const context = await browser.newContext({
    viewport: { width:390, height:844 },
    hasTouch:true,
    isMobile:true
  });
  const page = await context.newPage();
  return { context, page };
}

async function buttonCenter(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no hit box`);
  return { x:box.x+box.width/2, y:box.y+box.height/2 };
}

async function projectBodies(page) {
  return page.evaluate(() => {
    const app = window.VoxelApp;
    const rect = app.cvs.getBoundingClientRect();
    return window.VoxelBox3D.snapshotBodies().map((body) => {
      const p = new THREE.Vector3(body.x,body.y,body.z).project(app.cam);
      return {
        key:body.key,
        x:rect.left+(p.x+1)*.5*rect.width,
        y:rect.top+(1-p.y)*.5*rect.height
      };
    });
  });
}

test('two touch pointers own two independent native Box3D mouse-grab slots', async ({ browser }) => {
  const { context, page } = await mobilePage(browser);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type()==='error' && /box3d|wasm/i.test(msg.text())) errors.push(msg.text());
  });

  await page.goto(`${BASE}/`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true,
    null,
    { timeout:20000 }
  );

  await page.evaluate(() => {
    const app = window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled = false;
    window.VoxelPhysics.state.running = false;
    app.setBrushSize?.(1);
    app.voxels.clear();
    [[9,17,12,'#22D3EE'],[22,17,12,'#F59E0B']].forEach(([x,y,z,color]) => {
      app.voxels.set(app.key(x,y,z), {color,glass:false});
    });
    app.updateInstancedVoxels?.();
  });

  const play = await buttonCenter(page, '#vs-physics-test');
  await page.touchscreen.tap(play.x,play.y);
  await page.waitForFunction(() => window.VoxelBox3D.running && window.VoxelPhysics.state.enabled);
  await page.waitForFunction(() => window.VoxelBox3D.multiGrabReady === true);
  await page.waitForTimeout(100);

  const projected = await projectBodies(page);
  expect(projected).toHaveLength(2);
  const before = await page.evaluate(() => ({
    bodies:window.VoxelBox3D.snapshotBodies(),
    camera:window.VoxelApp.cam.position.toArray(),
    quaternion:window.VoxelApp.cam.quaternion.toArray()
  }));

  await page.evaluate(({ a, b }) => {
    const canvas = window.VoxelApp.cvs;
    const fire = (type, id, primary, x, y, buttons=1) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles:true,cancelable:true,composed:true,
      pointerId:id,pointerType:'touch',isPrimary:primary,button:0,buttons,
      clientX:x,clientY:y
    }));

    fire('pointerdown',101,true,a.x,a.y);
    fire('pointerdown',202,false,b.x,b.y);
    window.__dualGrabAfterDown = {
      pointers:window.VoxelPhysicsInputRouter.activePointerCount,
      slots:window.VoxelBox3D.activeMouseGrabSlots.slice(),
      count0:window.VoxelBox3D.mouseGrabCountForSlot(0),
      count1:window.VoxelBox3D.mouseGrabCountForSlot(1)
    };

    for (let i=1;i<=10;i++) {
      const t=i/10;
      fire('pointermove',101,true,a.x+70*t,a.y-26*t);
      fire('pointermove',202,false,b.x-70*t,b.y-26*t);
    }
  }, { a:projected[0], b:projected[1] });

  await page.waitForTimeout(450);
  const during = await page.evaluate(() => ({
    down:window.__dualGrabAfterDown,
    pointers:window.VoxelPhysicsInputRouter.activePointerCount,
    slots:window.VoxelBox3D.activeMouseGrabSlots.slice(),
    bodies:window.VoxelBox3D.snapshotBodies(),
    camera:window.VoxelApp.cam.position.toArray(),
    quaternion:window.VoxelApp.cam.quaternion.toArray()
  }));

  expect(during.down.pointers).toBe(2);
  expect(during.down.slots).toEqual([0,1]);
  expect(during.down.count0).toBe(1);
  expect(during.down.count1).toBe(1);
  expect(during.pointers).toBe(2);
  expect(during.slots).toEqual([0,1]);

  const delta0 = Math.hypot(
    during.bodies[0].x-before.bodies[0].x,
    during.bodies[0].y-before.bodies[0].y,
    during.bodies[0].z-before.bodies[0].z
  );
  const delta1 = Math.hypot(
    during.bodies[1].x-before.bodies[1].x,
    during.bodies[1].y-before.bodies[1].y,
    during.bodies[1].z-before.bodies[1].z
  );
  expect(delta0).toBeGreaterThan(.08);
  expect(delta1).toBeGreaterThan(.08);
  expect(Math.hypot(...during.camera.map((v,i)=>v-before.camera[i]))).toBeLessThan(1e-6);
  expect(Math.hypot(...during.quaternion.map((v,i)=>v-before.quaternion[i]))).toBeLessThan(1e-6);

  const afterFirstUp = await page.evaluate(({ a }) => {
    const canvas = window.VoxelApp.cvs;
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true,cancelable:true,composed:true,
      pointerId:101,pointerType:'touch',isPrimary:true,button:0,buttons:0,
      clientX:a.x+70,clientY:a.y-26
    }));
    return {
      pointers:window.VoxelPhysicsInputRouter.activePointerCount,
      slots:window.VoxelBox3D.activeMouseGrabSlots.slice()
    };
  }, { a:projected[0] });
  expect(afterFirstUp.pointers).toBe(1);
  expect(afterFirstUp.slots).toEqual([1]);

  const afterSecondUp = await page.evaluate(({ b }) => {
    const canvas = window.VoxelApp.cvs;
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true,cancelable:true,composed:true,
      pointerId:202,pointerType:'touch',isPrimary:false,button:0,buttons:0,
      clientX:b.x-70,clientY:b.y-26
    }));
    return {
      pointers:window.VoxelPhysicsInputRouter.activePointerCount,
      slots:window.VoxelBox3D.activeMouseGrabSlots.slice(),
      active:window.VoxelBox3D.mouseGrabActive
    };
  }, { b:projected[1] });
  expect(afterSecondUp.pointers).toBe(0);
  expect(afterSecondUp.slots).toEqual([]);
  expect(afterSecondUp.active).toBe(false);
  expect(errors).toEqual([]);

  await page.touchscreen.tap(play.x,play.y);
  await page.waitForFunction(() => !window.VoxelBox3D.running && !window.VoxelPhysics.state.enabled);
  await context.close();
});
