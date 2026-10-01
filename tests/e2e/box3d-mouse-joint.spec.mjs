import { test, expect } from '@playwright/test';

const BASE=process.env.VS_TEST_BASE_URL||'http://127.0.0.1:4173';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('voxelshaper_onboarding_dont_show','true'));
});

async function ready(page){
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoxelApp&&window.VoxelPhysics?.playOnly===true&&window.VoxelBox3D?.hardened===true&&window.VoxelPhysicsInputRouter?.installed===true,null,{timeout:20000});
  return page.evaluate(()=>{
    const app=window.VoxelApp;
    window.VoxelBox3D.stop?.(); window.VoxelPhysics.state.enabled=false; window.VoxelPhysics.state.running=false;
    app.setBrushSize?.(1); app.voxels.clear();
    [[12,16,12,'#22D3EE'],[12,17,12,'#F59E0B'],[13,18,12,'#A78BFA']].forEach(([x,y,z,color])=>app.voxels.set(app.key(x,y,z),{color,glass:false}));
    app.updateInstancedVoxels?.();
    return [...app.voxels.entries()].map(([k,v])=>[String(k),v.color,!!v.glass]);
  });
}

async function center(page,selector){
  const r=await page.locator(selector).boundingBox(); if(!r)throw new Error(`${selector} has no hit box`);
  return {x:r.x+r.width/2,y:r.y+r.height/2,r};
}

async function pickRealMouseTarget(page){
  return page.evaluate(()=>{
    const app=window.VoxelApp,box=window.VoxelBox3D,rect=app.cvs.getBoundingClientRect(),bodies=box.snapshotBodies();
    const offsets=[0,-4,4,-8,8,-12,12,-16,16,-20,20,-24,24];
    for(let i=0;i<bodies.length;i++){
      const b=bodies[i],p=new THREE.Vector3(b.x,b.y,b.z).project(app.cam);
      const cx=rect.left+(p.x+1)*.5*rect.width,cy=rect.top+(1-p.y)*.5*rect.height;
      for(const dy of offsets){
        for(const dx of offsets){
          const x=cx+dx,y=cy+dy;
          if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)continue;
          if(document.elementFromPoint(x,y)!==app.cvs)continue;
          const hitIndex=box.bodyAtPointer(x,y);
          if(hitIndex>=0)return {x,y,index:hitIndex,projectedIndex:i,dx,dy};
        }
      }
    }
    return {x:NaN,y:NaN,index:-1,projectedIndex:-1};
  });
}

test('desktop real mouse activates native Box3D grab without moving camera',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/box3d|wasm/i.test(m.text()))errors.push(m.text());});
  const original=await ready(page);
  const play=await center(page,'#vs-physics-test');
  const playHit=await page.evaluate(({x,y})=>({hit:!!document.elementFromPoint(x,y)?.closest?.('#vs-physics-test'),disabled:document.querySelector('#vs-physics-test')?.disabled}),play);
  expect(play.r.x).toBeLessThanOrEqual(24); expect(playHit.hit).toBe(true); expect(playHit.disabled).toBe(false);
  await page.mouse.click(play.x,play.y);
  await page.waitForFunction(()=>window.VoxelBox3D.running&&window.VoxelPhysics.state.enabled&&window.VoxelPhysicsInputRouter.mode==='physics');
  await page.waitForTimeout(80);

  const target=await pickRealMouseTarget(page);
  expect(target.index,'no actual Box3D-render ray hit was found around any projected body').toBeGreaterThanOrEqual(0);
  const before=await page.evaluate(index=>({body:window.VoxelBox3D.snapshotBodies()[index],camera:window.VoxelApp.cam.position.toArray(),quaternion:window.VoxelApp.cam.quaternion.toArray()}),target.index);

  await page.mouse.move(target.x,target.y);
  await page.mouse.down();
  await page.waitForFunction(()=>window.VoxelBox3D.mouseGrabActive===true&&window.VoxelPhysicsInputRouter.dragging===true,null,{timeout:5000});
  const active=await page.evaluate(()=>({count:window.VoxelBox3D.mouseGrabCount,router:window.VoxelPhysicsInputRouter.mode,grabs:window.VoxelPhysicsInputRouter.activeGrabs}));
  expect(active.count).toBe(1); expect(active.router).toBe('physics'); expect(active.grabs).toHaveLength(1);
  await page.mouse.move(target.x+110,target.y-35,{steps:14}); await page.waitForTimeout(320);

  const during=await page.evaluate(index=>({body:window.VoxelBox3D.snapshotBodies()[index],camera:window.VoxelApp.cam.position.toArray(),quaternion:window.VoxelApp.cam.quaternion.toArray(),grab:window.VoxelBox3D.mouseGrabActive}),target.index);
  expect(during.grab).toBe(true);
  expect(Math.hypot(during.body.x-before.body.x,during.body.y-before.body.y,during.body.z-before.body.z)).toBeGreaterThan(.08);
  expect(Math.hypot(...during.camera.map((v,i)=>v-before.camera[i]))).toBeLessThan(1e-6);
  expect(Math.hypot(...during.quaternion.map((v,i)=>v-before.quaternion[i]))).toBeLessThan(1e-6);

  await page.mouse.up(); await page.waitForFunction(()=>!window.VoxelBox3D.mouseGrabActive&&!window.VoxelPhysicsInputRouter.dragging);
  const stop=await center(page,'#vs-physics-test'); await page.mouse.click(stop.x,stop.y);
  await page.waitForFunction(()=>!window.VoxelBox3D.running&&!window.VoxelPhysics.state.enabled);
  const reset=await page.evaluate(()=>({sim:!!window.VoxelApp.scene.getObjectByName('VoxelBox3DSimple'),snapshot:[...window.VoxelApp.voxels.entries()].map(([k,v])=>[String(k),v.color,!!v.glass])}));
  expect(reset.sim).toBe(false); expect(reset.snapshot).toEqual(original); expect(errors).toEqual([]);
});

test('3x3 brush creates nine native Box3D MotorJoints and 1x1 creates one',async({page})=>{
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoxelApp&&window.VoxelPhysics?.playOnly===true&&window.VoxelBox3D?.hardened===true,null,{timeout:20000});
  await page.evaluate(()=>{
    const app=window.VoxelApp; window.VoxelBox3D.stop?.(); window.VoxelPhysics.state.enabled=false; window.VoxelPhysics.state.running=false;
    app.setBrushSize?.(3); app.voxels.clear();
    for(let x=12;x<=14;x++)for(let z=12;z<=14;z++)app.voxels.set(app.key(x,16,z),{color:'#22D3EE',glass:false});
    app.updateInstancedVoxels?.();
  });
  const p=await center(page,'#vs-physics-test'); await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>window.VoxelBox3D.running&&window.VoxelPhysics.state.enabled); await page.waitForTimeout(80);
  const result=await page.evaluate(async()=>{
    const app=window.VoxelApp,box=window.VoxelBox3D,bodies=box.snapshotBodies(),centerIndex=bodies.findIndex(b=>b.key===app.key(13,16,13));
    const selected=box.brushBodyIndices({index:centerIndex,normal:new THREE.Vector3(0,1,0)},app.brushSize),c=bodies[centerIndex],point=new THREE.Vector3(c.x,c.y,c.z),before=bodies.map(b=>({...b}));
    const started=box.beginMouseGrab(selected,point,100); box.updateMouseGrab(new THREE.Vector3(point.x+1.2,point.y+.2,point.z)); await new Promise(r=>setTimeout(r,350));
    const after=box.snapshotBodies(),moved=selected.filter(i=>Math.hypot(after[i].x-before[i].x,after[i].y-before[i].y,after[i].z-before[i].z)>.04).length;
    return {selected,started,nativeCount:box.mouseGrabCount,moved};
  });
  expect(result.selected).toHaveLength(9); expect(result.started).toBe(true); expect(result.nativeCount).toBe(9); expect(result.moved).toBeGreaterThanOrEqual(7);
  await page.evaluate(()=>window.VoxelBox3D.endMouseGrab()); expect(await page.evaluate(()=>window.VoxelBox3D.mouseGrabCount)).toBe(0);
  const one=await page.evaluate(()=>{const app=window.VoxelApp; app.setBrushSize?.(1); const bodies=window.VoxelBox3D.snapshotBodies(),i=bodies.findIndex(b=>b.key===app.key(13,16,13)); return window.VoxelBox3D.brushBodyIndices({index:i,normal:new THREE.Vector3(0,1,0)},app.brushSize);});
  expect(one).toHaveLength(1); await page.locator('#vs-physics-test').click(); await page.waitForFunction(()=>!window.VoxelBox3D.running&&!window.VoxelPhysics.state.enabled);
});
