import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function mobilePage(browser) {
  const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  await context.addInitScript(() => localStorage.setItem('voxelshaper_onboarding_dont_show','true'));
  return { context, page:await context.newPage() };
}

async function setupModel(page) {
  await page.waitForFunction(() =>
    window.VoxelApp && window.VoxelPhysics?.playOnly === true &&
    window.VoxelBox3D?.hardened === true &&
    window.VoxelPhysicsInputRouter?.installed === true &&
    window.VoxelHistory?.installed === true,
    null, {timeout:20000});
  return page.evaluate(() => {
    const app=window.VoxelApp;
    window.VoxelBox3D.stop?.();
    window.VoxelPhysics.state.enabled=false;
    window.VoxelPhysics.state.running=false;
    app.voxels.clear();
    [[12,16,12,'#22D3EE'],[12,17,12,'#F59E0B'],[13,18,12,'#A78BFA']].forEach(([x,y,z,color])=>
      app.voxels.set(app.key(x,y,z),{color,glass:false}));
    app.updateInstancedVoxels?.();
    return {
      snapshot:[...app.voxels.entries()].map(([k,v])=>[String(k),v.color,!!v.glass]),
      mode:app.mobileCanvasMode||'view'
    };
  });
}

async function center(page, selector) {
  const r=await page.locator(selector).boundingBox();
  if(!r) throw new Error(`${selector} has no hit box`);
  return {x:r.x+r.width/2,y:r.y+r.height/2};
}

async function play(page) {
  const p=await center(page,'#vs-physics-test');
  await page.touchscreen.tap(p.x,p.y);
  await page.waitForFunction(()=>window.VoxelBox3D.running && window.VoxelPhysics.state.enabled && window.VoxelPhysicsInputRouter.mode==='physics');
  await page.waitForFunction(()=>document.getElementById('mobile-canvas-mode-toggle')?.dataset.mode==='physics-grab');
}

async function stop(page) {
  const p=await center(page,'#vs-physics-test');
  await page.touchscreen.tap(p.x,p.y);
  await page.waitForFunction(()=>!window.VoxelBox3D.running && !window.VoxelPhysics.state.running && !window.VoxelPhysics.state.enabled);
}

async function projectFirstBody(page) {
  return page.evaluate(()=>{
    const app=window.VoxelApp;
    const body=window.VoxelBox3D.snapshotBodies()[0];
    const rect=app.cvs.getBoundingClientRect();
    const p=new THREE.Vector3(body.x,body.y,body.z).project(app.cam);
    return {x:rect.left+(p.x+1)*.5*rect.width,y:rect.top+(1-p.y)*.5*rect.height};
  });
}

async function pointerDrag(page, from, to, pointerId=77) {
  await page.evaluate(({from,to,pointerId})=>{
    const canvas=window.VoxelApp.cvs;
    const common={bubbles:true,cancelable:true,composed:true,pointerId,pointerType:'touch',isPrimary:true,button:0,buttons:1};
    canvas.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX:from.x,clientY:from.y}));
    window.__touchMouseJointObserved=!!window.VoxelBox3D.mouseGrabActive;
    for(let i=1;i<=10;i++){
      const t=i/10;
      canvas.dispatchEvent(new PointerEvent('pointermove',{...common,clientX:from.x+(to.x-from.x)*t,clientY:from.y+(to.y-from.y)*t}));
      window.__touchMouseJointObserved ||= !!window.VoxelBox3D.mouseGrabActive;
    }
    canvas.dispatchEvent(new PointerEvent('pointerup',{...common,buttons:0,clientX:to.x,clientY:to.y}));
  },{from,to,pointerId});
}

async function orbitDrag(page) {
  await page.evaluate(()=>{
    const app=window.VoxelApp;
    const r=app.cvs.getBoundingClientRect();
    const from={x:r.left+r.width*.72,y:r.top+r.height*.48};
    const to={x:r.left+r.width*.46,y:r.top+r.height*.36};
    const common={bubbles:true,cancelable:true,composed:true,pointerId:88,pointerType:'touch',isPrimary:true,button:0,buttons:1};
    app.cvs.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX:from.x,clientY:from.y}));
    for(let i=1;i<=10;i++){
      const t=i/10;
      app.cvs.dispatchEvent(new PointerEvent('pointermove',{...common,clientX:from.x+(to.x-from.x)*t,clientY:from.y+(to.y-from.y)*t}));
    }
    app.cvs.dispatchEvent(new PointerEvent('pointerup',{...common,buttons:0,clientX:to.x,clientY:to.y}));
  });
}

test('mobile Play is hit-testable and running Physics toggles Grab <-> Orbit without restart', async ({browser})=>{
  const {context,page}=await mobilePage(browser);
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await setupModel(page);

  const playHit=await page.evaluate(()=>{
    const b=document.querySelector('#vs-physics-test'),r=b.getBoundingClientRect();
    const x=r.left+r.width/2,y=r.top+r.height/2;
    return {left:r.left,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:!!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'),disabled:b.disabled};
  });
  expect(playHit.visible).toBe(true); expect(playHit.hit).toBe(true); expect(playHit.disabled).toBe(false); expect(playHit.left).toBeLessThanOrEqual(20);
  expect(await page.locator('#vs-physics-toggle-desktop').count()).toBe(0);
  expect(await page.locator('#vs-physics-panel').count()).toBe(0);
  expect(await page.locator('#vs-physics-toolbar').count()).toBe(0);

  const modeButton=page.locator('#mobile-canvas-mode-toggle');
  const m=await center(page,'#mobile-canvas-mode-toggle');
  const first=await modeButton.getAttribute('data-mode');
  expect(['view','edit']).toContain(first);
  await page.touchscreen.tap(m.x,m.y); await page.waitForTimeout(80);
  const second=await modeButton.getAttribute('data-mode');
  expect(['view','edit']).toContain(second); expect(second).not.toBe(first);
  await page.touchscreen.tap(m.x,m.y); await page.waitForTimeout(80);
  expect(await modeButton.getAttribute('data-mode')).toBe(first);

  const modeBefore=await page.evaluate(()=>window.VoxelApp.mobileCanvasMode||'view');
  await play(page);
  expect(await modeButton.getAttribute('data-mode')).toBe('physics-grab');
  await page.touchscreen.tap(m.x,m.y);
  await page.waitForFunction(()=>window.VoxelPhysicsInputRouter.mode==='physics-orbit');
  expect(await page.evaluate(()=>window.VoxelBox3D.running)).toBe(true);

  const before=await page.evaluate(()=>({p:window.VoxelApp.cam.position.toArray(),q:window.VoxelApp.cam.quaternion.toArray()}));
  await orbitDrag(page); await page.waitForTimeout(120);
  const after=await page.evaluate(()=>({p:window.VoxelApp.cam.position.toArray(),q:window.VoxelApp.cam.quaternion.toArray(),grabbed:window.VoxelBox3D.mouseGrabActive,running:window.VoxelBox3D.running}));
  expect(Math.max(Math.hypot(...after.p.map((v,i)=>v-before.p[i])),Math.hypot(...after.q.map((v,i)=>v-before.q[i])))).toBeGreaterThan(1e-5);
  expect(after.grabbed).toBe(false); expect(after.running).toBe(true);

  await page.touchscreen.tap(m.x,m.y);
  await page.waitForFunction(()=>window.VoxelPhysicsInputRouter.mode==='physics');
  expect(await page.evaluate(()=>window.VoxelBox3D.running)).toBe(true);
  await stop(page); await page.waitForTimeout(80);
  expect(await page.evaluate(()=>window.VoxelApp.mobileCanvasMode||'view')).toBe(modeBefore);
  await context.close();
});

test('mobile grab uses native 3D mouse joint and never moves camera', async ({browser})=>{
  const {context,page}=await mobilePage(browser); const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/box3d|wasm/i.test(m.text()))errors.push(m.text());});
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await setupModel(page); await play(page); await page.waitForTimeout(80);
  const p=await projectFirstBody(page);
  const before=await page.evaluate(()=>({b:window.VoxelBox3D.snapshotBodies()[0],p:window.VoxelApp.cam.position.toArray(),q:window.VoxelApp.cam.quaternion.toArray()}));
  await pointerDrag(page,p,{x:p.x+90,y:p.y-28}); await page.waitForTimeout(450);
  const after=await page.evaluate(()=>({b:window.VoxelBox3D.snapshotBodies()[0],p:window.VoxelApp.cam.position.toArray(),q:window.VoxelApp.cam.quaternion.toArray(),observed:!!window.__touchMouseJointObserved,released:!window.VoxelBox3D.mouseGrabActive}));
  expect(after.observed).toBe(true); expect(after.released).toBe(true);
  expect(Math.hypot(after.b.x-before.b.x,after.b.y-before.b.y,after.b.z-before.b.z)).toBeGreaterThan(.08);
  expect(Math.hypot(...after.p.map((v,i)=>v-before.p[i]))).toBeLessThan(1e-6);
  expect(Math.hypot(...after.q.map((v,i)=>v-before.q[i]))).toBeLessThan(1e-6);
  expect(errors).toEqual([]); await stop(page); await context.close();
});

test('Stop restores exact authoring origin and repeated Play/Stop is deterministic', async ({browser})=>{
  const {context,page}=await mobilePage(browser);
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); const setup=await setupModel(page);
  for(let i=0;i<8;i++){ await play(page); await stop(page); expect(await page.evaluate(()=>window.VoxelBox3D.getStatus?.().transition)).toBe('stopped'); }
  const reset=await page.evaluate(()=>({sim:!!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),preview:window.VoxelPhysics.state.preview,snapshot:[...window.VoxelApp.voxels.entries()].map(([k,v])=>[String(k),v.color,!!v.glass])}));
  expect(reset.sim).toBe(false); expect(reset.preview).toBe(null); expect(reset.snapshot).toEqual(setup.snapshot);
  expect(await page.locator('#vs-physics-test').isEnabled()).toBe(true); await context.close();
});

test('Undo/Redo synchronously resets Physics before deterministic history mutation', async ({browser})=>{
  const {context,page}=await mobilePage(browser);
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'}); await setupModel(page);
  expect(await page.evaluate(()=>window.VoxelHistory?.installed===true)).toBe(true);
  await page.evaluate(()=>{
    const app=window.VoxelApp,key=app.key(20,20,20);
    app.history=[]; app.historyPointer=-1;
    app.voxels.set(key,{color:'#FF00FF',glass:false}); app.updateInstancedVoxels?.();
    if(!app.addHistoryStep({type:'MODIFY',changes:new Map([[key,{before:null,after:{color:'#FF00FF',glass:false}}]])})) throw new Error('history step rejected');
    window.__historyTouchKey=key;
  });
  await play(page);
  const undo=await page.evaluate(()=>({result:window.VoxelApp.undo(),running:window.VoxelBox3D.running,enabled:window.VoxelPhysics.state.enabled,has:window.VoxelApp.voxels.has(window.__historyTouchKey)}));
  expect(undo.result).toBe(true); expect(undo.running).toBe(false); expect(undo.enabled).toBe(false); expect(undo.has).toBe(false);
  const redo=await page.evaluate(()=>({result:window.VoxelApp.redo(),has:window.VoxelApp.voxels.has(window.__historyTouchKey)}));
  expect(redo.result).toBe(true); expect(redo.has).toBe(true); await context.close();
});