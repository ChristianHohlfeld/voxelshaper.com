/*!
 * voxelshaper_io.js – Self-contained VOX ⇄ OBJ Importer & Exporter
 * Version 0.2 (2025-07-10)
 *
 * © 2025 OpenAI / ChatGPT. Released under the MIT License – free for commercial and private use.
 */
(function(global){
  "use strict";

  /* ---------- Konstanten & Helpers ---------- */
  const MAGIC = "VOX ";
  const VERSION = 150;

  const readInt  = (dv,o)=>dv.getInt32(o,true);
  const writeInt = (dv,o,v)=>dv.setInt32(o,v,true);
  const str4 = s=>[...s].map(c=>c.charCodeAt(0));
  const idToStr = id=>String.fromCharCode(...id);

  /* ---------- Datenobjekt ---------- */
  class VoxModel{
    constructor(sizeX=0,sizeY=0,sizeZ=0,voxels=[],palette=null){
      this.sizeX=sizeX; this.sizeY=sizeY; this.sizeZ=sizeZ;
      this.voxels=voxels;                       // [{x,y,z,c}]
      this.palette=palette||VoxModel.defaultPalette();
    }
    static defaultPalette(){
      const p=new Uint32Array(256);
      for(let i=0;i<256;i++) p[i]=0xff000000|((i<<16)&0xff0000)|((i<<8)&0xff00)|(i&0xff);
      return p;
    }
  }

  /* ---------- VOX Parser ---------- */
  function parseVox(arrayBuffer){
    const dv=new DataView(arrayBuffer);
    if(idToStr(new Uint8Array(arrayBuffer,0,4))!==MAGIC) throw Error("Invalid VOX file");
    const version=readInt(dv,4);
    if(version!==VERSION) console.warn("Untested VOX version",version);

    let offset=8;
    const mainHdr=chunkHeader();
    if(mainHdr.id!=="MAIN") throw Error("MAIN chunk missing");
    offset+=mainHdr.contentSize;
    const end=offset+mainHdr.childrenSize;

    let sx=0,sy=0,sz=0,voxels=[],palette=null;

    while(offset<end){
      const ch=chunkHeader();
      const dataPos=ch.headerPos+12;
      switch(ch.id){
        case "SIZE":
          sx=readInt(dv,dataPos); sy=readInt(dv,dataPos+4); sz=readInt(dv,dataPos+8);
          break;
        case "XYZI": {
          const n=readInt(dv,dataPos);
          for(let i=0;i<n;i++){
            const base=dataPos+4+i*4;
            voxels.push({
              x:dv.getUint8(base),
              y:dv.getUint8(base+1),
              z:dv.getUint8(base+2),
              c:dv.getUint8(base+3)
            });
          }
        } break;
        case "RGBA":
          palette=new Uint32Array(arrayBuffer,dataPos,256);
          break;
      }
      offset=dataPos+ch.contentSize+ch.childrenSize;
    }
    return new VoxModel(sx,sy,sz,voxels,palette);

    function chunkHeader(){
      const id=idToStr(new Uint8Array(arrayBuffer,offset,4));
      const cs=readInt(dv,offset+4);
      const ch=readInt(dv,offset+8);
      const headerPos=offset;
      return {id,contentSize:cs,childrenSize:ch,headerPos};
    }
  }

  /* ---------- VOX Serializer ---------- */
  function buildVox(model){
    /* SIZE */
    const sizeBuf=new ArrayBuffer(24); const dvSize=new DataView(sizeBuf);
    writeChunkHeader(dvSize,0,"SIZE",12,0);
    writeInt(dvSize,12,model.sizeX); writeInt(dvSize,16,model.sizeY); writeInt(dvSize,20,model.sizeZ);

    /* XYZI */
    const n=model.voxels.length;
    const xyziBuf=new ArrayBuffer(16+n*4); const dvXi=new DataView(xyziBuf);
    writeChunkHeader(dvXi,0,"XYZI",4+n*4,0);
    writeInt(dvXi,12,n);
    model.voxels.forEach((v,i)=>{
      const b=16+i*4;
      dvXi.setUint8(b,v.x); dvXi.setUint8(b+1,v.y); dvXi.setUint8(b+2,v.z); dvXi.setUint8(b+3,v.c);
    });

    /* RGBA */
    const rgbaBuf=new ArrayBuffer(12+1024); const dvRg=new DataView(rgbaBuf);
    writeChunkHeader(dvRg,0,"RGBA",1024,0);
    const pal=model.palette||VoxModel.defaultPalette();
    for(let i=0;i<256;i++) dvRg.setUint32(12+i*4,pal[i],true);

    /* MAIN */
    const children=sizeBuf.byteLength+xyziBuf.byteLength+rgbaBuf.byteLength;
    const mainBuf=new ArrayBuffer(12); const dvMain=new DataView(mainBuf);
    writeChunkHeader(dvMain,0,"MAIN",0,children);

    /* Assemble file */
    const header=new Uint8Array(8);
    header.set(str4(MAGIC),0); new DataView(header.buffer).setInt32(4,VERSION,true);
    const out=new Uint8Array(header.byteLength+mainBuf.byteLength+children);
    let off=0;
    out.set(header,off); off+=header.byteLength;
    out.set(new Uint8Array(mainBuf),off); off+=mainBuf.byteLength;
    out.set(new Uint8Array(sizeBuf),off); off+=sizeBuf.byteLength;
    out.set(new Uint8Array(xyziBuf),off); off+=xyziBuf.byteLength;
    out.set(new Uint8Array(rgbaBuf),off);
    return out.buffer;

    function writeChunkHeader(dv,o,id,cs,ch){
      str4(id).forEach((b,i)=>dv.setUint8(o+i,b));
      writeInt(dv,o+4,cs); writeInt(dv,o+8,ch);
    }
  }

  /* ---------- VOX → OBJ ---------- */
  function voxToOBJ(model,cubeSize=1){
    const verts=[],faces=[]; let base=1;
    const v=[ [0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1] ];
    const q=[ [1,2,3,4],[8,7,6,5],[5,6,2,1],[2,6,7,3],[3,7,8,4],[5,1,4,8] ];
    model.voxels.forEach(vox=>{
      const bx=vox.x*cubeSize, by=vox.y*cubeSize, bz=vox.z*cubeSize;
      v.forEach(c=>verts.push([bx+c[0]*cubeSize,by+c[1]*cubeSize,bz+c[2]*cubeSize]));
      q.forEach(f=>{
        faces.push([f[0]+base-1,f[1]+base-1,f[2]+base-1]);
        faces.push([f[0]+base-1,f[2]+base-1,f[3]+base-1]);
      });
      base+=8;
    });
    let obj="o vox_model\n";
    verts.forEach(p=>obj+=`v ${p[0]} ${p[1]} ${p[2]}\n`);
    faces.forEach(f=>obj+=`f ${f[0]} ${f[1]} ${f[2]}\n`);
    return obj;
  }

  /* ---------- OBJ → VOX ---------- */
  function objToVox(txt,voxelSize=1){
    const vs=[],fs=[];
    txt.split(/\\r?\\n/).forEach(l=>{
      const t=l.trim();
      if(t.startsWith("v ")) vs.push(t.slice(2).trim().split(/\\s+/).map(Number));
      else if(t.startsWith("f ")){
        const a=t.slice(2).trim().split(/\\s+/).map(x=>parseInt(x.split("/")[0])-1);
        if(a.length>=3) fs.push(a.slice(0,3));
      }
    });
    if(!vs.length||!fs.length) throw Error("OBJ ohne Geometrie");

    const mins=[...vs[0]],maxs=[...vs[0]];
    vs.forEach(p=>{ for(let i=0;i<3;i++){ mins[i]=Math.min(mins[i],p[i]); maxs[i]=Math.max(maxs[i],p[i]); }});
    const size=[0,1,2].map(i=>Math.ceil((maxs[i]-mins[i])/voxelSize)+1);

    const set=new Set();
    fs.forEach(f=>{
      const tri=f.map(i=>vs[i]);
      const bb=[0,1,2].flatMap(i=>[
        Math.floor((Math.min(...tri.map(p=>p[i]))-mins[i])/voxelSize),
        Math.floor((Math.max(...tri.map(p=>p[i]))-mins[i])/voxelSize)
      ]);
      for(let x=bb[0];x<=bb[1];x++) for(let y=bb[2];y<=bb[3];y++) for(let z=bb[4];z<=bb[5];z++)
        set.add(`${x},${y},${z}`);
    });
    const vox=[];
    set.forEach(k=>{ const [x,y,z]=k.split(",").map(Number); vox.push({x,y,z,c:1}); });
    return new VoxModel(...size,vox);
  }

  /* ---------- Download Helper ---------- */
  function saveBlob(data,name){
    const blob=new Blob([data]);
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=name; a.style.display="none";
    document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},500);
  }

  /* ---------- Export ---------- */
  const API={parseVox,buildVox,voxToOBJ,objToVox,saveBlob,VoxModel};
  if(typeof module!=="undefined"&&module.exports) module.exports=API;
  else global.VoxelShaperIO=API;

})(typeof window!=="undefined"?window:this);
