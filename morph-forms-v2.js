(function () {
  'use strict';

  const ENGINE_VERSION = '5.0.0-procedural';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hashString(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  function domainSeed(seed, domain) { return hashString(`${seed >>> 0}:${domain}`); }
  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function irand(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function pick(rng, arr) { return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]; }
  function coordHash(seed, x, y, z) {
    let h = seed >>> 0;
    h ^= Math.imul(x | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h ^= Math.imul(y | 0, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
    h ^= Math.imul(z | 0, 0x165667b1); h ^= h >>> 15;
    return (h >>> 0) / 4294967295;
  }
  function fbm(seed, x, y, z) {
    let sum = 0, amp = .58, norm = 0, f = .14;
    for (let i = 0; i < 4; i++) {
      const xi = Math.floor(x * f * 17), yi = Math.floor(y * f * 17), zi = Math.floor(z * f * 17);
      sum += (coordHash(seed + i * 1013, xi, yi, zi) * 2 - 1) * amp;
      norm += amp; amp *= .5; f *= 2.03;
    }
    return sum / norm;
  }

  const PALETTES = {
    atlas:   ['#D7E0E8','#8594A3','#3C4856','#18212B','#58E1FF','#F6C85F','#FF6B6B','#A78BFA'],
    ember:   ['#E7D6C4','#9D6B53','#50352D','#211A18','#FFB347','#FF5D4D','#F5E663','#90D7FF'],
    verdant: ['#CDE8C5','#73A96B','#315C3A','#172C22','#75F0C3','#F1D36B','#B5A5FF','#86C8FF'],
    void:    ['#DDE1F1','#7780A0','#343951','#121522','#8A7DFF','#40E0D0','#FF4F9A','#F7D66D'],
    mono:    ['#F3F4F6','#AAB2BD','#606975','#252B33','#FFFFFF','#BFC7D5','#8B95A3','#D9DEE6']
  };

  function paletteFor(meta, seed) {
    const color = clamp(Number(meta.color ?? 65) / 100, 0, 1);
    const names = Object.keys(PALETTES);
    let name = String(meta.palette || 'auto').toLowerCase();
    if (!PALETTES[name]) name = names[Math.floor(coordHash(seed, 7, 11, 13) * names.length) % names.length];
    const base = PALETTES[name];
    const rotate = Math.floor(color * (base.length - 1));
    return {
      name,
      primary: base[rotate % base.length],
      secondary: base[(rotate + 1) % base.length],
      dark: base[3],
      light: base[0],
      glow: base[4],
      accent: base[5],
      accent2: base[6],
      accent3: base[7]
    };
  }

  function build(meta, app) {
    const type = String(meta.type || 'spaceship');
    const seed = Number.isFinite(+meta.seed) ? (+meta.seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0);
    const shapeT = smooth(clamp(Number(meta.shape ?? 55) / 100, 0, 1));
    const detailT = clamp(Number(meta.detail ?? meta.complexity ?? (35 + shapeT * 55)) / 100, 0, 1);
    const mutationT = clamp(Number(meta.mutation ?? 0) / 100, 0, 1);
    const mobile = !!app?.isMobile;
    const budget = Math.max(1200, Number(meta.maxVoxels) || (mobile ? 5200 : 12000));
    const N = clamp(Math.round(Number(meta.gridSize) || lerp(34, 52, shapeT)), 28, mobile ? 46 : 58);
    const mid = Math.floor(N / 2);
    const C = paletteFor(meta, seed);

    const silhouette = rngFrom(domainSeed(seed, 'silhouette'));
    const topology = rngFrom(domainSeed(seed, 'topology'));
    const modules = rngFrom(domainSeed(seed, 'modules'));
    const details = rngFrom(domainSeed(seed, 'details'));
    const asymmetry = rngFrom(domainSeed(seed, 'asymmetry'));
    const noiseSeed = domainSeed(seed, 'noise');
    const mutationSeed = domainSeed(seed ^ Math.floor(mutationT * 0xffff), 'mutation');

    const vox = new Map();
    function key(x,y,z) { return `${x|0},${y|0},${z|0}`; }
    function put(x,y,z,color=C.primary,priority=2) {
      x = Math.round(x); y = Math.round(y); z = Math.round(z);
      if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
      const k = key(x,y,z);
      const old = vox.get(k);
      if (!old || priority >= old.priority) vox.set(k, {x,y,z,color,priority});
    }
    function cut(x,y,z) { vox.delete(key(Math.round(x),Math.round(y),Math.round(z))); }
    function box(x0,x1,y0,y1,z0,z1,color=C.primary,p=3) {
      for (let x=Math.ceil(x0);x<=Math.floor(x1);x++) for(let y=Math.ceil(y0);y<=Math.floor(y1);y++) for(let z=Math.ceil(z0);z<=Math.floor(z1);z++) put(x,y,z,color,p);
    }
    function shell(x0,x1,y0,y1,z0,z1,color=C.primary,p=3) {
      for (let x=Math.ceil(x0);x<=Math.floor(x1);x++) for(let y=Math.ceil(y0);y<=Math.floor(y1);y++) for(let z=Math.ceil(z0);z<=Math.floor(z1);z++) {
        if (x===Math.ceil(x0)||x===Math.floor(x1)||y===Math.ceil(y0)||y===Math.floor(y1)||z===Math.ceil(z0)||z===Math.floor(z1)) put(x,y,z,color,p);
      }
    }
    function ellipsoid(cx,cy,cz,rx,ry,rz,color=C.primary,p=3,warp=0) {
      const x0=Math.floor(cx-rx-1),x1=Math.ceil(cx+rx+1),y0=Math.floor(cy-ry-1),y1=Math.ceil(cy+ry+1),z0=Math.floor(cz-rz-1),z1=Math.ceil(cz+rz+1);
      for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++) {
        const dx=(x-cx)/Math.max(.01,rx),dy=(y-cy)/Math.max(.01,ry),dz=(z-cz)/Math.max(.01,rz);
        const n=warp?fbm(noiseSeed,x,y,z)*warp:0;
        if(dx*dx+dy*dy+dz*dz <= 1+n) put(x,y,z,color,p);
      }
    }
    function sphere(cx,cy,cz,r,color=C.primary,p=3,warp=0) { ellipsoid(cx,cy,cz,r,r,r,color,p,warp); }
    function line3(a,b,r,color=C.primary,p=3) {
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)*1.6));
      for(let i=0;i<=steps;i++) {
        const t=i/steps;
        sphere(lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t),r,color,p);
      }
    }
    function taperedLine(a,b,r0,r1,color=C.primary,p=3) {
      const d=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
      const steps=Math.max(2,Math.ceil(d*1.4));
      for(let i=0;i<=steps;i++) {
        const t=i/steps;
        sphere(lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t),lerp(r0,r1,t),color,p);
      }
    }
    function mirrorX(x) { return mid - (x-mid); }
    function symPut(x,y,z,color,p=2) { put(x,y,z,color,p); put(mirrorX(x),y,z,color,p); }
    function symBox(x0,x1,y0,y1,z0,z1,color,p=3) {
      box(x0,x1,y0,y1,z0,z1,color,p);
      box(mirrorX(x1),mirrorX(x0),y0,y1,z0,z1,color,p);
    }
    function hollowEllipsoid(cx,cy,cz,rx,ry,rz,thickness,color,p=3) {
      for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++) for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let z=Math.floor(cz-rz);z<=Math.ceil(cz+rz);z++) {
        const d=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2);
        if(d<=1 && d>=1-thickness) put(x,y,z,color,p);
      }
    }

    function spaceship() {
      const length = Math.round(lerp(20, N-8, shapeT));
      const z0 = mid - Math.floor(length*.48), z1 = mid + Math.floor(length*.48);
      const hullR = lerp(2.2,4.4,shapeT) + silhouette()*.9;
      const hullY = mid + lerp(-2,2,silhouette());
      const profile = pick(topology,['needle','fighter','shuttle','hauler']);

      for(let z=z0;z<=z1;z++) {
        const t=(z-z0)/Math.max(1,z1-z0);
        let r=hullR;
        if(profile==='needle') r*=Math.sin(Math.PI*clamp(t,.03,.97))*.9+.25;
        else if(profile==='fighter') r*=t<.72?1:Math.max(.2,(1-t)/.28);
        else if(profile==='shuttle') r*=.75+.25*Math.sin(Math.PI*t);
        else r*=t<.18?lerp(.45,1,t/.18):t>.84?lerp(1,.55,(t-.84)/.16):1;
        ellipsoid(mid,hullY,z,r,Math.max(1.3,r*.72),1.15,pick(details,[C.primary,C.secondary,C.primary]),4,.08*detailT);
      }

      const cockpitZ=Math.round(lerp(mid+2,z1-5,.55+.25*shapeT));
      ellipsoid(mid,hullY+Math.max(2,hullR*.7),cockpitZ,Math.max(1.5,hullR*.62),Math.max(1.2,hullR*.46),Math.max(2.2,hullR*.8),C.glow,5,.03);

      const wingStyle=pick(topology,['swept','delta','fork','blade']);
      const span=Math.round(lerp(7,Math.min(mid-3,17),shapeT));
      const wz=Math.round(lerp(mid-4,mid+2,silhouette()));
      if(wingStyle==='delta') {
        for(let i=0;i<span;i++) {
          const depth=Math.max(1,Math.round((span-i)*.45));
          symBox(mid+3+i,mid+3+i,hullY-1,hullY,wz-depth,wz+depth,C.secondary,4);
        }
      } else if(wingStyle==='swept') {
        for(let i=0;i<span;i++) symBox(mid+3+i,mid+3+i,hullY-1,hullY,wz-Math.floor(i*.45),wz+2,C.secondary,4);
      } else if(wingStyle==='fork') {
        symBox(mid+3,mid+span,hullY-1,hullY,wz-5,wz-2,C.secondary,4);
        symBox(mid+5,mid+span-2,hullY-1,hullY,wz+2,wz+5,C.secondary,4);
      } else {
        symBox(mid+3,mid+span,hullY-1,hullY,wz-1,wz+1,C.secondary,4);
      }

      const engineCount=pick(modules,[1,2,2,3,4]);
      const engineR=Math.max(1,Math.min(2.2,hullR*.46));
      for(let i=0;i<engineCount;i++) {
        const offset=(i-(engineCount-1)/2)*Math.max(2,engineR*1.8);
        ellipsoid(mid+offset,hullY,z0+1,engineR,engineR,2.5,C.dark,5);
        put(mid+offset,hullY,z0-1,C.glow,6);
      }

      if(detailT>.25) {
        const strips=2+Math.floor(detailT*5);
        for(let i=0;i<strips;i++) {
          const z=irand(details,z0+4,z1-5);
          symPut(mid+Math.round(hullR),hullY+irand(details,-1,1),z,pick(details,[C.accent,C.accent2,C.light]),2);
        }
      }
      if(detailT>.55) {
        const finH=Math.round(lerp(3,8,detailT));
        box(mid,mid,hullY+2,hullY+finH,z0+3,z0+8,C.secondary,3);
      }
      if(asymmetry()<(.14+.35*mutationT)) {
        const side=asymmetry()<.5?-1:1;
        const ax=mid+side*Math.round(hullR+3);
        taperedLine([ax,hullY,wz],[ax+side*irand(asymmetry,3,7),hullY+irand(asymmetry,-1,2),wz+irand(asymmetry,-3,3)],1.2,.7,C.accent2,4);
      }
    }

    function castle(ruined=false) {
      const half=Math.round(lerp(8,15,shapeT));
      const wallH=Math.round(lerp(7,14,shapeT));
      const x0=mid-half,x1=mid+half,z0=mid-half,z1=mid+half;
      box(x0-2,x1+2,0,1,z0-2,z1+2,C.secondary,5);
      shell(x0,x1,2,wallH,z0,z1,C.primary,5);
      const towerCount=shapeT>.65?8:4;
      const towerR=Math.round(lerp(2,4,shapeT));
      const anchors=[[x0,z0],[x1,z0],[x0,z1],[x1,z1],[mid,z0],[mid,z1],[x0,mid],[x1,mid]].slice(0,towerCount);
      anchors.forEach(([x,z],i)=>{
        const h=wallH+irand(modules,3,9)+(i%2?0:Math.round(shapeT*3));
        ellipsoid(x,h/2+2,z,towerR,h/2,towerR,C.primary,5,.03);
        box(x-towerR-1,x+towerR+1,h,h,z-towerR-1,z+towerR+1,C.accent,4);
        if(detailT>.35) for(let y=5;y<h-2;y+=3) put(x,y,z+(i%2? towerR:-towerR),C.glow,6);
      });
      const keepR=Math.round(lerp(3,6,shapeT));
      const keepH=wallH+Math.round(lerp(4,10,shapeT));
      shell(mid-keepR,mid+keepR,2,keepH,mid-keepR,mid+keepR,C.secondary,6);
      if(detailT>.45) {
        for(let x=x0+3;x<x1-2;x+=4) put(x,wallH+1,z1,C.accent,3);
        for(let z=z0+3;z<z1-2;z+=4) put(x1,wallH+1,z,C.accent,3);
      }
      box(mid-2,mid+2,2,Math.min(7,wallH-1),z1-1,z1+1,C.dark,7);
      if(ruined) {
        const erosion=.12+.22*detailT;
        [...vox.values()].forEach(v=>{
          if(v.y<2) return;
          const n=coordHash(mutationSeed,v.x,v.y,v.z);
          const exposed=v.y>wallH*.55 || Math.abs(v.x-mid)>half*.65 || Math.abs(v.z-mid)>half*.65;
          if(exposed && n<erosion) cut(v.x,v.y,v.z);
        });
      }
    }

    function recursiveTree() {
      box(mid-9,mid+9,0,0,mid-9,mid+9,C.secondary,5);
      const trunkH=Math.round(lerp(9,18,shapeT));
      const branches=[];
      function branch(a,b,r,depth,localSeed) {
        taperedLine(a,b,r,Math.max(.6,r*.62),C.dark,5);
        if(depth<=0) {
          sphere(b[0],b[1],b[2],lerp(2.2,4.1,detailT),pick(details,[C.primary,C.secondary,C.accent3]),3,.18);
          return;
        }
        const rr=rngFrom(localSeed);
        const count=2+(rr()>.58?1:0);
        for(let i=0;i<count;i++) {
          const yaw=(i/count)*Math.PI*2+rr()*1.2;
          const len=lerp(4,8,shapeT)*(1+rr()*.35)*(.72+depth*.12);
          const up=.45+rr()*.45;
          const next=[b[0]+Math.cos(yaw)*len,b[1]+len*up,b[2]+Math.sin(yaw)*len];
          branches.push([b,next,Math.max(.65,r*.66),depth-1,domainSeed(localSeed,`b${i}`)]);
        }
      }
      branch([mid,1,mid],[mid,trunkH,mid],lerp(1.3,2.5,shapeT),Math.round(lerp(2,4,detailT)),domainSeed(seed,'root'));
      while(branches.length) branch(...branches.shift());
    }

    function mech() {
      const torsoY=Math.round(lerp(10,17,shapeT));
      const torsoW=Math.round(lerp(3,6,shapeT));
      box(mid-torsoW,mid+torsoW,torsoY-4,torsoY+3,mid-3,mid+3,C.primary,6);
      ellipsoid(mid,torsoY+6,mid,Math.max(2,torsoW*.55),2.5,2.5,C.secondary,6);
      symPut(mid+Math.max(1,Math.floor(torsoW*.35)),torsoY+6,mid+2,C.glow,7);
      const stance=Math.round(lerp(2,5,shapeT));
      const footY=1;
      for(const side of [-1,1]) {
        const hip=mid+side*Math.max(2,Math.floor(torsoW*.55));
        const knee=mid+side*(Math.max(2,Math.floor(torsoW*.55))+stance*.35);
        line3([hip,torsoY-4,mid],[knee,Math.round(torsoY*.55),mid],1.4,C.secondary,5);
        line3([knee,Math.round(torsoY*.55),mid],[mid+side*stance,footY+2,mid+irand(modules,-1,1)],1.25,C.secondary,5);
        box(mid+side*stance-2,mid+side*stance+2,footY,footY+2,mid-3,mid+2,C.dark,6);
      }
      const armLen=Math.round(lerp(5,10,shapeT));
      for(const side of [-1,1]) {
        const shoulder=[mid+side*(torsoW+1),torsoY+1,mid];
        const hand=[mid+side*(torsoW+armLen),torsoY-4+irand(modules,-2,3),mid+irand(modules,-2,2)];
        line3(shoulder,hand,1.35,C.primary,5);
      }
      if(detailT>.35) symBox(mid+torsoW+1,mid+torsoW+3,torsoY+1,torsoY+4,mid-2,mid+2,C.accent,4);
      if(asymmetry()<.55) {
        const side=asymmetry()<.5?-1:1;
        const start=[mid+side*(torsoW+armLen),torsoY-3,mid];
        const end=[start[0]+side*irand(asymmetry,4,8),start[1],start[2]+irand(asymmetry,-1,2)];
        taperedLine(start,end,1.2,.7,C.accent2,6);
      }
    }

    function city() {
      box(0,N-1,0,0,0,N-1,C.dark,7);
      const block=Math.round(lerp(6,10,shapeT));
      const road=2;
      for(let bx=1;bx<N-3;bx+=block) for(let bz=1;bz<N-3;bz+=block) {
        const rr=rngFrom(domainSeed(seed,`parcel:${bx}:${bz}`));
        const w=Math.max(2,block-road-irand(rr,1,3));
        if(rr()<.14) {
          box(bx,bx+w,1,1,bz,bz+w,C.secondary,3);
          if(rr()>.45) sphere(bx+w*.5,3,bz+w*.5,2,C.primary,3,.1);
          continue;
        }
        const radial=1-Math.min(1,Math.hypot(bx-mid,bz-mid)/(N*.72));
        const h=Math.max(3,Math.round(lerp(4,N*.52,radial*(.35+.65*shapeT))*(.65+rr()*.7)));
        const archetype=pick(rr,['slab','tower','step']);
        if(archetype==='slab') shell(bx,bx+w,1,h,bz,bz+w,C.primary,5);
        else if(archetype==='tower') ellipsoid(bx+w*.5,h*.5+1,bz+w*.5,w*.55,h*.5,w*.55,C.primary,5,.02);
        else {
          for(let y=1;y<=h;y+=Math.max(3,Math.floor(h/3))) {
            const inset=Math.floor(y/h*2);
            box(bx+inset,bx+w-inset,y,Math.min(h,y+Math.max(2,Math.floor(h/3))-1),bz+inset,bz+w-inset,C.primary,5);
          }
        }
        if(detailT>.35) for(let y=3;y<h;y+=3) put(bx+Math.floor(w/2),y,bz,C.glow,6);
      }
      for(let i=0;i<N;i++) for(let r=0;r<road;r++) {
        put(i,1,mid+r-Math.floor(road/2),C.secondary,8);
        put(mid+r-Math.floor(road/2),1,i,C.secondary,8);
      }
    }

    function island(withWaterfall=false) {
      const rx=lerp(10,N*.38,shapeT), rz=rx*lerp(.72,1.25,silhouette());
      const topY=Math.round(lerp(9,16,shapeT));
      for(let x=Math.floor(mid-rx-2);x<=Math.ceil(mid+rx+2);x++) for(let z=Math.floor(mid-rz-2);z<=Math.ceil(mid+rz+2);z++) {
        const dx=(x-mid)/rx,dz=(z-mid)/rz;
        const d=Math.sqrt(dx*dx+dz*dz);
        const n=fbm(noiseSeed,x,0,z)*(.15+.18*detailT);
        if(d>1+n) continue;
        const surface=topY+Math.round(fbm(noiseSeed+99,x,7,z)*lerp(1,4,detailT));
        const depth=Math.max(2,Math.round((1-d)*lerp(5,14,shapeT)+2));
        for(let y=surface-depth;y<=surface;y++) put(x,y,z,y===surface?C.secondary:C.dark,5);
      }
      const treeCount=1+Math.floor(detailT*4);
      for(let i=0;i<treeCount;i++) {
        const rr=rngFrom(domainSeed(seed,`island-tree-${i}`));
        const x=mid+irand(rr,-Math.floor(rx*.55),Math.floor(rx*.55));
        const z=mid+irand(rr,-Math.floor(rz*.55),Math.floor(rz*.55));
        const h=irand(rr,4,8);
        line3([x,topY+1,z],[x,topY+h,z],.8,C.dark,4);
        sphere(x,topY+h+2,z,2.2+rr()*1.6,C.primary,3,.15);
      }
      if(withWaterfall) {
        const x=mid+Math.round(rx*.72);
        for(let y=2;y<=topY+2;y++) box(x,x+1,y,y,mid-1,mid+1,C.glow,7);
      }
    }

    function crystal() {
      sphere(mid,mid,mid,2.4,C.light,6,.08);
      const count=Math.round(lerp(7,18,detailT));
      for(let i=0;i<count;i++) {
        const rr=rngFrom(domainSeed(seed,`crystal-${i}`));
        const theta=rr()*Math.PI*2, phi=lerp(-.7,.9,rr());
        const len=lerp(6,15,shapeT)*(.7+rr()*.65);
        const dir=[Math.cos(theta)*Math.cos(phi),Math.sin(phi),Math.sin(theta)*Math.cos(phi)];
        taperedLine([mid,mid,mid],[mid+dir[0]*len,mid+dir[1]*len,mid+dir[2]*len],2.1,.25,pick(rr,[C.glow,C.accent,C.accent2,C.accent3]),5);
      }
    }

    function asteroid() {
      const r=lerp(8,N*.31,shapeT);
      for(let x=Math.floor(mid-r-2);x<=Math.ceil(mid+r+2);x++) for(let y=Math.floor(mid-r-2);y<=Math.ceil(mid+r+2);y++) for(let z=Math.floor(mid-r-2);z<=Math.ceil(mid+r+2);z++) {
        const dx=(x-mid)/(r*(.8+silhouette()*.3)),dy=(y-mid)/(r*(.75+silhouette()*.35)),dz=(z-mid)/(r*(.8+silhouette()*.3));
        const d=dx*dx+dy*dy+dz*dz;
        const n=fbm(noiseSeed,x,y,z)*(.28+.20*detailT);
        if(d<1+n) put(x,y,z,coordHash(noiseSeed+3,x,y,z)<.08?C.accent:C.dark,4);
      }
      const craters=Math.floor(2+detailT*5);
      for(let i=0;i<craters;i++) {
        const rr=rngFrom(domainSeed(seed,`crater-${i}`));
        const cx=mid+irand(rr,-Math.floor(r*.65),Math.floor(r*.65));
        const cy=mid+irand(rr,-Math.floor(r*.65),Math.floor(r*.65));
        const cz=mid+irand(rr,-Math.floor(r*.65),Math.floor(r*.65));
        const rradius=lerp(1.5,3.6,rr());
        for(let x=Math.floor(cx-rradius);x<=cx+rradius;x++) for(let y=Math.floor(cy-rradius);y<=cy+rradius;y++) for(let z=Math.floor(cz-rradius);z<=cz+rradius;z++) if((x-cx)**2+(y-cy)**2+(z-cz)**2<rradius**2) cut(x,y,z);
      }
    }

    function knot() {
      const R=lerp(7,N*.28,shapeT), tube=lerp(1.1,2.2,detailT);
      const loops=pick(topology,[2,3,4,5]);
      const samples=Math.round(lerp(90,210,detailT));
      for(let i=0;i<samples;i++) {
        const a=(i/samples)*Math.PI*2;
        const x=mid+Math.cos(a)*R;
        const z=mid+Math.sin(a)*R;
        const y=mid+Math.sin(loops*a)*R*.55;
        sphere(x,y,z,tube,pick(details,[C.primary,C.glow,C.accent]),4);
      }
    }

    function car() {
      const L=Math.round(lerp(7,13,shapeT)),W=Math.round(lerp(3,5,shapeT)),baseY=3;
      const profile=pick(topology,['sport','utility','rover']);
      box(mid-L,mid+L,baseY,baseY+3,mid-W,mid+W,C.primary,6);
      if(profile==='sport') ellipsoid(mid+2,baseY+5,mid,L*.55,2.2,W*.75,C.secondary,5);
      else if(profile==='utility') box(mid-L+3,mid+L-2,baseY+4,baseY+7,mid-W+1,mid+W-1,C.secondary,5);
      else shell(mid-L+3,mid+L-3,baseY+4,baseY+7,mid-W+1,mid+W-1,C.secondary,5);
      for(const sx of [-1,1]) for(const sz of [-1,1]) {
        const wx=mid+sx*Math.round(L*.65), wz=mid+sz*W;
        ellipsoid(wx,baseY,wz,1.6,1.6,1.0,C.dark,7);
      }
      box(mid+Math.round(L*.15),mid+Math.round(L*.65),baseY+5,baseY+6,mid-W,mid-W,C.glow,7);
      box(mid+Math.round(L*.15),mid+Math.round(L*.65),baseY+5,baseY+6,mid+W,mid+W,C.glow,7);
      if(detailT>.6) symPut(mid+W+2,baseY+4,mid-L+2,C.accent,3);
    }

    const generators = {
      spaceship,
      castle: () => castle(false),
      ruins: () => castle(true),
      tree: recursiveTree,
      ifs_tree: recursiveTree,
      mech,
      city,
      floating_island: () => island(false),
      waterfall: () => island(true),
      crystal,
      sponge: crystal,
      asteroid,
      knot,
      car
    };
    (generators[type] || generators.floating_island)();

    // Optional mutation is local and deterministic: it never changes the base DNA domains.
    if (mutationT > 0) {
      [...vox.values()].forEach(v => {
        const n=coordHash(mutationSeed,v.x,v.y,v.z);
        if(v.priority<5 && n < mutationT*.08) cut(v.x,v.y,v.z);
        else if(v.priority<4 && n > 1-mutationT*.06) v.color=C.accent2;
      });
    }

    let result=[...vox.values()];
    if(result.length>budget) {
      // Preserve structural voxels first; deterministic detail thinning only affects lower-priority decoration.
      result.sort((a,b)=>b.priority-a.priority || coordHash(domainSeed(seed,'budget'),a.x,a.y,a.z)-coordHash(domainSeed(seed,'budget'),b.x,b.y,b.z));
      result=result.slice(0,budget);
    }
    result.sort((a,b)=>a.y-b.y || a.z-b.z || a.x-b.x);

    return {
      gridSize:N,
      currentDrawingAxis:'y',
      activeDrawingLevel:{x:0,y:0,z:0},
      voxels:result.map(({x,y,z,color})=>({x,y,z,color})),
      metadata:{
        type,
        source:'morph_procedural_v5',
        engineVersion:ENGINE_VERSION,
        seed,
        shape:Number(meta.shape ?? 55),
        color:Number(meta.color ?? 65),
        palette:C.name,
        detail:Math.round(detailT*100),
        mutation:Math.round(mutationT*100),
        voxelCount:result.length,
        deterministic:true
      }
    };
  }

  function install() {
    const app=window.VoxelApp;
    if(!app || typeof app.openHubGenerator!=='function') return false;

    app.generateDeterministicHubProject=function(meta){ return build(meta||{},this); };
    app.fetchGeneratedHubProjectFromApi=async function(meta){ return build(meta||{},this); };

    app.mutateMorph=function(meta,intensity=20){
      const base={...(meta||this.morphSettings||{})};
      base.mutation=clamp(Number(intensity)||0,0,100);
      return build(base,this);
    };
    app.generateMorphLineage=function(meta,count=6){
      const base={...(meta||this.morphSettings||{})};
      return Array.from({length:clamp(Math.round(count)||6,1,24)},(_,i)=>build({...base,shape:clamp(Number(base.shape??55)+(i-(count-1)/2)*8,0,100)},this));
    };
    app.morphEngineInfo={
      version:ENGINE_VERSION,
      deterministic:true,
      domains:['silhouette','topology','modules','details','asymmetry','noise','palette'],
      principle:'seed DNA + independent procedural domains + controlled morph parameters'
    };
    app._morphV2=true;
    app._morphProceduralV5=true;
    return true;
  }

  const timer=setInterval(()=>{if(install())clearInterval(timer);},100);
  install();
})();
