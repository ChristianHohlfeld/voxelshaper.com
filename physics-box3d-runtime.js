(function () {
  'use strict';

  const SOURCE_COMMIT = '9f998c862d54c03a633ecea3831937385c78b532';
  const FIXED_DT = 1 / 60;
  const SUBSTEPS = 4;
  const DEG = Math.PI / 180;

  let app = null;
  let physics = null;
  let modulePromise = null;
  let api = null;
  let running = false;
  let raf = 0;
  let lastTime = 0;
  let accumulator = 0;
  let bodyRecords = [];
  let activeMovingHandle = 0;
  let activeMass = 1;
  let geometry = null;
  let motionListener = null;
  let motionBaseline = null;
  let motionPermissionGranted = false;
  let playInterceptorInstalled = false;

  function toast(title, text, type = 'info', ms = 1200) {
    try { app?.showToast?.(title, text, type, ms); } catch (_) {}
  }

  function syncPlayUI() {
    const on = !!running;
    const legacyIcon = document.getElementById('vsp-playicon');
    const legacyText = document.getElementById('vsp-playtext');
    const mobileIcon = document.querySelector('#vs-physics-test i');
    if (legacyIcon) legacyIcon.className = on ? 'fas fa-stop' : 'fas fa-play';
    if (legacyText) legacyText.textContent = on ? 'Stop test' : 'Test joint';
    if (mobileIcon) mobileIcon.className = on ? 'fas fa-stop' : 'fas fa-play';
  }

  function ensureModule() {
    if (modulePromise) return modulePromise;
    if (typeof window.createVoxelBox3DModule !== 'function') {
      return Promise.reject(new Error('Box3D loader missing'));
    }
    modulePromise = window.createVoxelBox3DModule({
      locateFile: (name) => name.endsWith('.wasm') ? 'lib/box3d/box3d.wasm' : `lib/box3d/${name}`
    }).then((mod) => {
      api = {
        reset: mod.cwrap('vsb3_reset', 'number', ['number','number','number']),
        destroy: mod.cwrap('vsb3_destroy', null, []),
        createBody: mod.cwrap('vsb3_create_body', 'number', ['number','number','number','number','number','number','number','number','number','number','number']),
        addBox: mod.cwrap('vsb3_add_box', 'number', ['number','number','number','number','number','number','number','number','number','number','number']),
        createRevolute: mod.cwrap('vsb3_create_revolute', 'number', ['number','number','number','number','number','number','number','number','number','number','number','number','number','number','number']),
        createPrismatic: mod.cwrap('vsb3_create_prismatic', 'number', ['number','number','number','number','number','number','number','number','number','number','number','number','number','number','number']),
        createWeld: mod.cwrap('vsb3_create_weld', 'number', ['number','number','number','number','number','number']),
        step: mod.cwrap('vsb3_step', null, ['number','number']),
        applyForce: mod.cwrap('vsb3_apply_force', null, ['number','number','number','number']),
        bodyMass: mod.cwrap('vsb3_body_mass', 'number', ['number']),
        px: mod.cwrap('vsb3_body_px', 'number', ['number']),
        py: mod.cwrap('vsb3_body_py', 'number', ['number']),
        pz: mod.cwrap('vsb3_body_pz', 'number', ['number']),
        qx: mod.cwrap('vsb3_body_qx', 'number', ['number']),
        qy: mod.cwrap('vsb3_body_qy', 'number', ['number']),
        qz: mod.cwrap('vsb3_body_qz', 'number', ['number']),
        qw: mod.cwrap('vsb3_body_qw', 'number', ['number'])
      };
      return mod;
    }).catch((err) => {
      modulePromise = null;
      api = null;
      throw err;
    });
    return modulePromise;
  }

  function seedKey(seed) {
    if (!Array.isArray(seed) || seed.length < 3) return null;
    return app.key(Math.round(seed[0]), Math.round(seed[1]), Math.round(seed[2]));
  }

  function componentFromKey(key) {
    if (key == null || !app.voxels?.has(key)) return null;
    const set = app.getConnectedGroup?.(key) || new Set([key]);
    if (!set.size) return null;
    const keys = [...set].sort();
    return { signature: keys.join('|'), keys };
  }

  function componentFromSeed(seed) {
    return componentFromKey(seedKey(seed));
  }

  function voxelColor(value) {
    if (value && typeof value === 'object' && value.color) return value.color;
    if (typeof value === 'string') return value;
    return '#ffffff';
  }

  function buildBodyRecord(component, dynamic, index) {
    const z = app.VS || 1;
    const centers = component.keys.map((key) => {
      const p = app.parseKey(key);
      return { key, x:(p[0]+.5)*z, y:(p[1]+.5)*z, z:(p[2]+.5)*z };
    });
    const origin = centers.reduce((o,p)=>({x:o.x+p.x,y:o.y+p.y,z:o.z+p.z}),{x:0,y:0,z:0});
    origin.x/=centers.length; origin.y/=centers.length; origin.z/=centers.length;

    const handle = api.createBody(dynamic?2:0, origin.x,origin.y,origin.z, 0,0,0,1, 1,.025,.04);
    if (!handle) throw new Error('Box3D body creation failed');

    for (const v of centers) {
      if (!api.addBox(handle, v.x-origin.x,v.y-origin.y,v.z-origin.z,
        z*.5,z*.5,z*.5, 1,.62,.04,0)) {
        throw new Error('Box3D voxel collider creation failed');
      }
    }

    const record = {component,dynamic,handle,origin,render:null,index};
    if (dynamic) {
      const group = new THREE.Group();
      group.name = `VoxelBox3D:${index}`;
      if (!geometry) geometry = new THREE.BoxGeometry(z*.965,z*.965,z*.965);
      for (const v of centers) {
        const mat = new THREE.MeshStandardMaterial({
          color:voxelColor(app.voxels.get(v.key)), transparent:true, opacity:.78,
          depthWrite:true, roughness:.52, metalness:.02
        });
        const mesh = new THREE.Mesh(geometry,mat);
        mesh.position.set(v.x-origin.x,v.y-origin.y,v.z-origin.z);
        group.add(mesh);
      }
      group.position.set(origin.x,origin.y,origin.z);
      app.scene.add(group);
      record.render = group;
    }
    return record;
  }

  function collectScene() {
    const joints = physics.state?.joints || [];
    if (!joints.length) throw new Error('No joints to simulate');

    const groupMap = new Map();
    const movingSigs = new Set();
    const seedToSig = new Map();
    const visited = new Set();

    const register = (component) => {
      if (!component) return null;
      if (!groupMap.has(component.signature)) groupMap.set(component.signature,component);
      component.keys.forEach((k)=>visited.add(k));
      return component.signature;
    };

    const registerSeed = (seed,moving) => {
      if (!seed) return null;
      const c = componentFromSeed(seed);
      const sig = register(c);
      if (sig) {
        seedToSig.set(JSON.stringify(seed),sig);
        if (moving) movingSigs.add(sig);
      }
      return sig;
    };

    for (const j of joints) {
      if (j.baseSeed) registerSeed(j.baseSeed,false);
      registerSeed(j.movingSeed,true);
    }

    // Everything not participating as a moving joint body remains static collision geometry.
    for (const key of app.voxels.keys()) {
      if (visited.has(key)) continue;
      register(componentFromKey(key));
    }

    const records = new Map();
    let index=0;
    for (const [sig,component] of groupMap) {
      records.set(sig,buildBodyRecord(component,movingSigs.has(sig),++index));
    }

    const worldAnchors = new Map();
    const worldBodyFor = (joint) => {
      if (worldAnchors.has(joint.id)) return worldAnchors.get(joint.id);
      const a=joint.anchor||[0,0,0];
      const h=api.createBody(0,a[0],a[1],a[2],0,0,0,1,0,0,0);
      if (!h) throw new Error('Box3D world anchor creation failed');
      worldAnchors.set(joint.id,h);
      return h;
    };

    for (const j of joints) {
      const bSig=seedToSig.get(JSON.stringify(j.movingSeed));
      const bodyB=records.get(bSig)?.handle||0;
      const aSig=j.baseSeed?seedToSig.get(JSON.stringify(j.baseSeed)):null;
      const bodyA=j.baseSeed?(records.get(aSig)?.handle||0):worldBodyFor(j);
      if (!bodyA||!bodyB) throw new Error(`Invalid bodies for ${j.name||'joint'}`);

      const a=j.anchor||[0,0,0], ax=j.axis||[0,1,0];
      const lim=j.limits||{enabled:true,min:-45,max:45};
      const mot=j.motor||{enabled:false,speed:0,strength:1};
      const strength=Math.max(.05,Number(mot.strength)||1);
      let jointHandle=0;

      if (j.type==='slider') {
        jointHandle=api.createPrismatic(bodyA,bodyB,a[0],a[1],a[2],ax[0],ax[1],ax[2],
          lim.enabled?1:0,(Number(lim.min)||0)*(app.VS||1),(Number(lim.max)||0)*(app.VS||1),
          mot.enabled?1:0,(Number(mot.speed)||0)*(app.VS||1),strength*20,0);
      } else if (j.type==='fixed') {
        jointHandle=api.createWeld(bodyA,bodyB,a[0],a[1],a[2],0);
      } else {
        jointHandle=api.createRevolute(bodyA,bodyB,a[0],a[1],a[2],ax[0],ax[1],ax[2],
          lim.enabled?1:0,(Number(lim.min)||0)*DEG,(Number(lim.max)||0)*DEG,
          mot.enabled?1:0,(Number(mot.speed)||0)*DEG,strength*20,0);
      }
      if (!jointHandle) throw new Error(`Box3D joint creation failed: ${j.name||j.type}`);
    }

    const active=joints.find((j)=>j.id===physics.state?.active);
    const activeSig=active?seedToSig.get(JSON.stringify(active.movingSeed)):null;
    activeMovingHandle=records.get(activeSig)?.handle||0;
    activeMass=activeMovingHandle?Math.max(.001,api.bodyMass(activeMovingHandle)||1):1;
    return [...records.values()];
  }

  function updateRender() {
    for (const b of bodyRecords) {
      if (!b.dynamic||!b.render) continue;
      b.render.position.set(api.px(b.handle),api.py(b.handle),api.pz(b.handle));
      b.render.quaternion.set(api.qx(b.handle),api.qy(b.handle),api.qz(b.handle),api.qw(b.handle)).normalize();
    }
  }

  function frame(now) {
    if (!running||!api) return;
    if (!physics?.state?.enabled||physics.state.running===false) {
      stop();
      return;
    }
    if (!lastTime) lastTime=now;
    const dt=Math.min(.08,Math.max(0,(now-lastTime)/1000));
    lastTime=now;
    accumulator+=dt;
    let steps=0;
    while (accumulator>=FIXED_DT&&steps<5) {
      api.step(FIXED_DT,SUBSTEPS);
      accumulator-=FIXED_DT;
      steps++;
    }
    updateRender();
    raf=requestAnimationFrame(frame);
  }

  function removeRender() {
    for (const b of bodyRecords) {
      if (!b.render) continue;
      b.render.traverse((o)=>{
        if (!o.material) return;
        if (Array.isArray(o.material)) o.material.forEach((m)=>m.dispose?.());
        else o.material.dispose?.();
      });
      b.render.parent?.remove(b.render);
    }
    bodyRecords=[];
    if (geometry) { geometry.dispose?.(); geometry=null; }
  }

  async function requestMotionPermission() {
    if (motionPermissionGranted) return true;
    try {
      if (typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function') {
        motionPermissionGranted=(await DeviceMotionEvent.requestPermission())==='granted';
      } else {
        motionPermissionGranted=typeof DeviceMotionEvent!=='undefined';
      }
    } catch (_) { motionPermissionGranted=false; }
    return motionPermissionGranted;
  }

  function startMotion() {
    if (!motionPermissionGranted||motionListener) return;
    motionBaseline=null;
    motionListener=(event)=>{
      if (!running||!api||!activeMovingHandle) return;
      let x=0,y=0,z=0;
      if (event.acceleration&&[event.acceleration.x,event.acceleration.y,event.acceleration.z].some(Number.isFinite)) {
        x=Number(event.acceleration.x)||0; y=Number(event.acceleration.y)||0; z=Number(event.acceleration.z)||0;
      } else {
        const g=event.accelerationIncludingGravity;
        if (!g) return;
        const raw={x:Number(g.x)||0,y:Number(g.y)||0,z:Number(g.z)||0};
        if (!motionBaseline) motionBaseline={...raw};
        motionBaseline.x=motionBaseline.x*.94+raw.x*.06;
        motionBaseline.y=motionBaseline.y*.94+raw.y*.06;
        motionBaseline.z=motionBaseline.z*.94+raw.z*.06;
        x=raw.x-motionBaseline.x; y=raw.y-motionBaseline.y; z=raw.z-motionBaseline.z;
      }
      const force=new THREE.Vector3(x,y,z);
      const camera=app.camera||app.cam||app.activeCamera||app.currentCamera;
      if (camera?.quaternion) force.applyQuaternion(camera.quaternion);
      const gain=1.65*activeMass;
      api.applyForce(activeMovingHandle,force.x*gain,force.y*gain,force.z*gain);
    };
    window.addEventListener('devicemotion',motionListener,{passive:true});
  }

  function stopMotion() {
    if (motionListener) window.removeEventListener('devicemotion',motionListener);
    motionListener=null; motionBaseline=null;
  }

  async function start() {
    if (running) return true;
    // Must be requested synchronously from the user's Play gesture on iOS.
    const permissionPromise=requestMotionPermission();
    try {
      await ensureModule();
      if (!api.reset(0,-9.81,0)) throw new Error('Box3D world init failed');
      bodyRecords=collectScene();
      if (!bodyRecords.some((b)=>b.dynamic)) throw new Error('No moving physics body');
      running=true;
      physics.state.running=true;
      lastTime=0; accumulator=0;
      syncPlayUI();
      const allowed=await permissionPromise;
      if (allowed) startMotion();
      toast('Physics',allowed?'Box3D live · move the phone to push the selected body':'Box3D live','info',1300);
      raf=requestAnimationFrame(frame);
      return true;
    } catch (err) {
      console.error('[VoxelShaper][Box3D]',err);
      stop();
      toast('Physics',`Box3D test failed: ${err?.message||err}`,'error',2000);
      return false;
    }
  }

  function stop() {
    running=false;
    cancelAnimationFrame(raf); raf=0;
    lastTime=0; accumulator=0;
    stopMotion();
    removeRender();
    try { api?.destroy?.(); } catch (_) {}
    activeMovingHandle=0; activeMass=1;
    if (physics?.state) {
      physics.state.running=false;
      physics.state.preview=null;
    }
    syncPlayUI();
    return true;
  }

  function toggle() { return running?Promise.resolve(stop()):start(); }

  function interceptLegacyPlay() {
    if (playInterceptorInstalled) return;
    playInterceptorInstalled=true;
    document.addEventListener('click',(event)=>{
      const target=event.target?.closest?.('#vsp-play');
      if (!target||!physics?.state?.enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle().finally(syncPlayUI);
    },true);
  }

  function install() {
    app=window.VoxelApp;
    physics=window.VoxelPhysics;
    if (!app||!physics||!app.scene||!app.voxels) return false;
    if (window.VoxelBox3D?.installed) return true;
    window.VoxelBox3D={
      installed:true, sourceCommit:SOURCE_COMMIT,
      get running(){return running;},
      get ready(){return !!api;},
      start,stop,toggle
    };
    interceptLegacyPlay();
    syncPlayUI();
    return true;
  }

  const timer=setInterval(()=>{if(install())clearInterval(timer);},100);
  setTimeout(()=>{clearInterval(timer);install();},10000);
})();
