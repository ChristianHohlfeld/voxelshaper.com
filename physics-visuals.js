(function () {
  'use strict';

  function install() {
    const app = window.VoxelApp;
    const physics = window.VoxelPhysics;
    if (!app?.scene || !physics?.state || typeof THREE === 'undefined') return false;
    if (window.VoxelPhysicsVisuals?.installed) return true;

    const root = new THREE.Group();
    root.name = 'VoxelPhysicsVisuals';
    root.renderOrder = 999;
    app.scene.add(root);

    let lastSignature = '';
    let labelTexture = null;

    const dispose = (obj) => {
      obj?.traverse?.((o) => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.());
        else o.material?.dispose?.();
      });
      obj?.parent?.remove(obj);
    };

    const clear = () => {
      while (root.children.length) dispose(root.children[0]);
      labelTexture?.dispose?.();
      labelTexture = null;
    };

    const material = (color, opacity = .92) => new THREE.LineBasicMaterial({
      color, transparent:true, opacity, depthTest:false, depthWrite:false
    });

    const meshMaterial = (color, opacity = .92) => new THREE.MeshBasicMaterial({
      color, transparent:true, opacity, depthTest:false, depthWrite:false
    });

    const axisVector = (joint) => new THREE.Vector3(...(joint.axis || [0,1,0])).normalize();

    function basis(axis) {
      const helper = Math.abs(axis.y) < .85 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
      const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
      const v = new THREE.Vector3().crossVectors(axis, u).normalize();
      return {u,v};
    }

    function line(points, color, opacity = .92) {
      const g = new THREE.BufferGeometry().setFromPoints(points);
      const l = new THREE.Line(g, material(color, opacity));
      l.renderOrder = 999;
      root.add(l);
      return l;
    }

    function dot(position, radius, color, opacity = .95) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), meshMaterial(color, opacity));
      m.position.copy(position);
      m.renderOrder = 1000;
      root.add(m);
      return m;
    }

    function cone(position, direction, size, color) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(size*.45, size, 12), meshMaterial(color,.96));
      c.position.copy(position);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction.clone().normalize());
      c.renderOrder = 1000;
      root.add(c);
      return c;
    }

    function label(text, position, scale, color = '#dff8ff') {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = 'rgba(5,10,18,.82)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(2,2,508,92,30); else ctx.rect(2,2,508,92);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '700 38px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text,256,50);
      labelTexture = new THREE.CanvasTexture(canvas);
      labelTexture.colorSpace = THREE.SRGBColorSpace || labelTexture.colorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,transparent:true,depthTest:false,depthWrite:false}));
      sprite.position.copy(position);
      sprite.scale.set(scale*3.7,scale*.70,1);
      sprite.renderOrder = 1001;
      root.add(sprite);
    }

    function hingeVisual(j, active) {
      const z = app.VS || 1;
      const center = new THREE.Vector3(...j.anchor);
      const axis = axisVector(j);
      const {u,v} = basis(axis);
      const radius = z * (active ? .62 : .48);
      const lo = j.limits?.enabled === false ? -180 : Number(j.limits?.min ?? -45);
      const hi = j.limits?.enabled === false ? 180 : Number(j.limits?.max ?? 45);
      const a0 = Math.min(lo,hi) * Math.PI/180;
      const a1 = Math.max(lo,hi) * Math.PI/180;
      const steps = Math.max(12,Math.ceil(Math.abs(a1-a0)/(Math.PI/30)));
      const points=[];
      for(let i=0;i<=steps;i++) {
        const a=a0+(a1-a0)*(i/steps);
        points.push(center.clone().addScaledVector(u,Math.cos(a)*radius).addScaledVector(v,Math.sin(a)*radius));
      }
      line(points,active?0x67e8f9:0x64748b,active?.95:.48);
      if (points.length) {
        dot(points[0],z*.055,0xf59e0b,active?.95:.55);
        dot(points[points.length-1],z*.055,0xf59e0b,active?.95:.55);
      }
      if (active && j.motor?.enabled) {
        const end=points[Math.min(points.length-1,Math.max(1,Math.floor(points.length*.72)))];
        const tangent=new THREE.Vector3().crossVectors(axis,end.clone().sub(center)).normalize();
        cone(end,tangent,z*.22,0xfbbf24);
      }
    }

    function sliderVisual(j, active) {
      const z=app.VS||1;
      const center=new THREE.Vector3(...j.anchor);
      const axis=axisVector(j);
      const lo=(j.limits?.enabled===false?-3:Number(j.limits?.min??-2))*z;
      const hi=(j.limits?.enabled===false?3:Number(j.limits?.max??2))*z;
      const a=center.clone().addScaledVector(axis,Math.min(lo,hi));
      const b=center.clone().addScaledVector(axis,Math.max(lo,hi));
      line([a,b],active?0x67e8f9:0x64748b,active?.96:.5);
      dot(a,z*.07,0xf59e0b,active?.95:.55);
      dot(b,z*.07,0xf59e0b,active?.95:.55);
      if(active&&j.motor?.enabled) cone(center.clone().addScaledVector(axis,z*.38),axis,z*.28,0xfbbf24);
    }

    function fixedVisual(j, active) {
      if (!active) return;
      const z=app.VS||1;
      const c=new THREE.Vector3(...j.anchor);
      const s=z*.36;
      line([c.clone().add(new THREE.Vector3(-s,0,0)),c.clone().add(new THREE.Vector3(s,0,0))],0x94a3b8,.9);
      line([c.clone().add(new THREE.Vector3(0,-s,0)),c.clone().add(new THREE.Vector3(0,s,0))],0x94a3b8,.9);
      line([c.clone().add(new THREE.Vector3(0,0,-s)),c.clone().add(new THREE.Vector3(0,0,s))],0x94a3b8,.9);
    }

    function redraw() {
      clear();
      if (!physics.state.enabled) return;
      const joints=physics.state.joints||[];
      const activeId=physics.state.active;
      for(const j of joints) {
        if(!j.anchor) continue;
        const active=j.id===activeId;
        if(j.type==='slider') sliderVisual(j,active);
        else if(j.type==='fixed') fixedVisual(j,active);
        else hingeVisual(j,active);
      }
      const j=joints.find((x)=>x.id===activeId);
      if(j?.anchor) {
        const z=app.VS||1;
        const axis=axisVector(j);
        const axisName=Math.abs(axis.x)>.8?'X':Math.abs(axis.z)>.8?'Z':'Y';
        const kind=j.type==='slider'?'SLIDER':j.type==='fixed'?'FIXED':'HINGE';
        const motor=j.motor?.enabled?' · MOTOR':'';
        const p=new THREE.Vector3(...j.anchor).add(new THREE.Vector3(0,z*.78,0));
        label(`${kind} · ${axisName}${motor}`,p,z*.72,j.motor?.enabled?'#fde68a':'#dff8ff');
      }
    }

    function signature() {
      const s=physics.state;
      return JSON.stringify({
        enabled:!!s.enabled,active:s.active,
        joints:(s.joints||[]).map((j)=>[j.id,j.type,j.anchor,j.axis,j.limits,j.motor])
      });
    }

    const timer=setInterval(()=>{
      const sig=signature();
      if(sig!==lastSignature) { lastSignature=sig; redraw(); }
    },90);

    window.VoxelPhysicsVisuals={installed:true,root,redraw,destroy(){clearInterval(timer);clear();root.parent?.remove(root);}};
    redraw();
    return true;
  }

  const timer=setInterval(()=>{if(install())clearInterval(timer);},100);
  setTimeout(()=>{clearInterval(timer);install();},10000);
})();
