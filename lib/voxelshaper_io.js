/*!
 * voxelshaper_io.js – Self-contained VOX ⇄ OBJ Importer & Exporter
 * Version 0.1 (2025-07-10)
 *
 * © 2025 OpenAI / ChatGPT. Released under the MIT License – free for commercial and private use.
 *
 * Architektur-Notizen
 * -------------------
 * - Keine externen Abhängigkeiten. Der gesamte Code läuft direkt im Browser (ES2020).
 * - Baut VOX-Modelle (MagicaVoxel v150) mit Hilfe eines sehr einfachen Parsers und Serialisers.
 * - Exportiert jedes Voxel als Würfel (12 Triangles). Für performantere OBJ-Dateien bitte eine
 *   Mesh-Optimierung (z. B. Greedy Meshing) ergänzen.
 * - Umgekehrte Richtung (OBJ → VOX) verwendet eine naive Bounding-Box-Voxelisation.
 *   Hinreichend für low-poly-Meshes; für komplexere Geometrien bitte einen besseren Rasteriser integrieren.
 *
 * Öffentliche API
 * --------------
 *   VoxelShaperIO.parseVox(arrayBuffer)   → VoxModel
 *   VoxelShaperIO.buildVox(voxModel)      → ArrayBuffer (binary .vox)
 *   VoxelShaperIO.voxToOBJ(voxModel)      → String (ASCII .obj)
 *   VoxelShaperIO.objToVox(objText)       → VoxModel
 *   VoxelShaperIO.saveBlob(data,name)     → Triggert Download im Browser
 *   VoxelShaperIO.VoxModel                → Klasse als DTO
 *
 * Einbindung
 * ---------
 *   <script src="/pfad/zu/voxelshaper_io.js"></script>
 *
 *   // Beispiel: VOX → OBJ
 *   const ab = await fetch("modell.vox").then(r=>r.arrayBuffer());
 *   const vox = VoxelShaperIO.parseVox(ab);
 *   const obj = VoxelShaperIO.voxToOBJ(vox, 1);
 *   VoxelShaperIO.saveBlob(obj, "modell.obj");
 */
(function(global){
  "use strict";

  /*** Konstanten & Hilfsfunktionen *******************************************/
  const MAGIC = "VOX ";            // MagicaVoxel Header
  const VERSION = 150;              // aktuell unterstützte Version

  function readInt(dv, offset){ return dv.getInt32(offset, true); }
  function writeInt(dv, offset, value){ dv.setInt32(offset, value, true); }

  function str4(str){               // 4-Byte ID in ArrayBuffer schreiben/lesen
    return [str.charCodeAt(0), str.charCodeAt(1), str.charCodeAt(2), str.charCodeAt(3)];
  }

  function idToStr(id){
    return String.fromCharCode.apply(null, id);
  }

  /*** Daten-Container *******************************************************/
  class VoxModel{
    constructor(sizeX=0, sizeY=0, sizeZ=0, voxels=[], palette=null){
      this.sizeX = sizeX;
      this.sizeY = sizeY;
      this.sizeZ = sizeZ;
      this.voxels = voxels;         // [{x,y,z,c}]
      this.palette = palette || VoxModel.defaultPalette();
    }
    static defaultPalette(){        // Standard-Palette v150
      const p = new Uint32Array(256);
      for(let i=0;i<256;i++) p[i] = 0xff000000 | ((i<<16)&0xff0000) | ((i<<8)&0xff00) | (i&0xff);
      return p;
    }
  }

  /*** VOX Parser ************************************************************/
  function parseVox(arrayBuffer){
    const dv = new DataView(arrayBuffer);
    const magic = idToStr(new Uint8Array(arrayBuffer,0,4));
    if(magic !== MAGIC) throw new Error("Keine gültige VOX-Datei");
    const version = readInt(dv,4);
    if(version !== VERSION) console.warn(`VOX Version ${version} → Untestet, weiter mit Vorsicht…`);

    let offset = 8;
    const {id:mainId, contentSize:mainCs, childrenSize:mainCh} = readChunkHeader();
    if(mainId!=="MAIN") throw new Error("MAIN-Chunk fehlt");
    offset += mainCs;
    const end = offset + mainCh;

    let sizeX=0, sizeY=0, sizeZ=0, voxels=[], palette=null;

    while(offset < end){
      const {id, contentSize, childrenSize, headerPos} = readChunkHeader();
      const contentPos = headerPos + 12;

      switch(id){
        case "SIZE":
          sizeX = readInt(dv, contentPos+0);
          sizeY = readInt(dv, contentPos+4);
          sizeZ = readInt(dv, contentPos+8);
          break;
        case "XYZI":{
          const n = readInt(dv, contentPos);
          for(let i=0;i<n;i++){
            const base = contentPos+4+i*4;
            const x = dv.getUint8(base);
            const y = dv.getUint8(base+1);
            const z = dv.getUint8(base+2);
            const c = dv.getUint8(base+3);
            voxels.push({x,y,z,c});
          }
        } break;
        case "RGBA":
          palette = new Uint32Array(arrayBuffer, contentPos, 256);
          break;
      }
      offset = contentPos + contentSize + childrenSize;
    }
    return new VoxModel(sizeX,sizeY,sizeZ,voxels,palette);

    function readChunkHeader(){
      const id = idToStr(new Uint8Array(arrayBuffer, offset, 4));
      const cs = readInt(dv, offset+4);
      const ch = readInt(dv, offset+8);
      const headerPos = offset;
      return {id, contentSize:cs, childrenSize:ch, headerPos};
    }
  }

  /*** VOX Serialisierung *****************************************************/
  function buildVox(model){
    const sizeChunk = new ArrayBuffer(24);
    const dvSize = new DataView(sizeChunk);
    writeChunkHeader(dvSize,0,"SIZE",12,0);
    writeInt(dvSize,12,model.sizeX);
    writeInt(dvSize,16,model.sizeY);
    writeInt(dvSize,20,model.sizeZ);

    const nVox = model.voxels.length;
    const xyziChunk = new ArrayBuffer(16 + nVox*4);
    const dvXi = new DataView(xyziChunk);
    writeChunkHeader(dvXi,0,"XYZI",4 + nVox*4,0);
    writeInt(dvXi,12,nVox);
    model.voxels.forEach((v,i)=>{
      const base = 16 + i*4;
      dvXi.setUint8(base, v.x);
      dvXi.setUint8(base+1, v.y);
      dvXi.setUint8(base+2, v.z);
      dvXi.setUint8(base+3, v.c);
    });

    const rgbaChunk = new ArrayBuffer(12 + 1024);
    const dvRgba = new DataView(rgbaChunk);
    writeChunkHeader(dvRgba,0,"RGBA",1024,0);
    const pal = model.palette || VoxModel.defaultPalette();
    for(let i=0;i<256;i++) dvRgba.setUint32(12+i*4, pal[i], true);

    const totalChildren = sizeChunk.byteLength + xyziChunk.byteLength + rgbaChunk.byteLength;
    const mainChunk = new ArrayBuffer(12);
    const dvMain = new DataView(mainChunk);
    writeChunkHeader(dvMain,0,"MAIN",0,totalChildren);

    const header = new Uint8Array(8);
    header.set(str4(MAGIC),0);
    new DataView(header.buffer).setInt32(4, VERSION, true);

    const output = new Uint8Array(header.byteLength + mainChunk.byteLength + totalChildren);
    let off = 0;
    output.set(header, off);                 off += header.byteLength;
    output.set(new Uint8Array(mainChunk), off); off += mainChunk.byteLength;
    output.set(new Uint8Array(sizeChunk), off); off += sizeChunk.byteLength;
    output.set(new Uint8Array(xyziChunk), off); off += xyziChunk.byteLength;
    output.set(new Uint8Array(rgbaChunk), off);

    return output.buffer;

    function writeChunkHeader(dv, offset, id, contentSize, childrenSize){
      const idBytes = str4(id);
      idBytes.forEach((b,i)=>dv.setUint8(offset+i,b));
      writeInt(dv, offset+4, contentSize);
      writeInt(dv, offset+8, childrenSize);
    }
  }

  /*** VOX → OBJ **************************************************************/
  function voxToOBJ(model, cubeSize=1){
    const verts=[], faces=[]; let vOffset=1;
    const cubeVerts=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const cubeFaces=[[1,2,3,4],[8,7,6,5],[5,6,2,1],[2,6,7,3],[3,7,8,4],[5,1,4,8]];
    model.voxels.forEach(v=>{
      const baseX = v.x * cubeSize, baseY = v.y * cubeSize, baseZ = v.z * cubeSize;
      cubeVerts.forEach(c=>verts.push([baseX+c[0]*cubeSize, baseY+c[1]*cubeSize, baseZ+c[2]*cubeSize]));
      cubeFaces.forEach(f=>{
        faces.push([f[0]+vOffset-1, f[1]+vOffset-1, f[2]+vOffset-1]);
        faces.push([f[0]+vOffset-1, f[2]+vOffset-1, f[3]+vOffset-1]);
      });
      vOffset += 8;
    });
    let obj=\"o vox_model\\n\";
    verts.forEach(v=>obj+=`v ${v[0]} ${v[1]} ${v[2]}\\n`);
    faces.forEach(f=>obj+=`f ${f[0]} ${f[1]} ${f[2]}\\n`);
    return obj;
  }

  /*** OBJ → VOX **************************************************************/
  function objToVox(objText, voxelSize=1){
    const lines=objText.split(/\\r?\\n/), vertices=[], faces=[];
    lines.forEach(l=>{
      const t=l.trim();
      if(t.startsWith(\"v \")) vertices.push(t.slice(2).trim().split(/\\s+/).map(Number));
      else if(t.startsWith(\"f \")){
        const vs=t.slice(2).trim().split(/\\s+/).map(v=>parseInt(v.split(\"/\")[0])-1);
        if(vs.length>=3) faces.push(vs.slice(0,3));
      }
    });
    if(!vertices.length||!faces.length) throw new Error(\"OBJ enthält keine Geometrie\");

    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    vertices.forEach(v=>{
      minX=Math.min(minX,v[0]);maxX=Math.max(maxX,v[0]);
      minY=Math.min(minY,v[1]);maxY=Math.max(maxY,v[1]);
      minZ=Math.min(minZ,v[2]);maxZ=Math.max(maxZ,v[2]);
    });

    const sizeX=Math.ceil((maxX-minX)/voxelSize)+1;
    const sizeY=Math.ceil((maxY-minY)/voxelSize)+1;
    const sizeZ=Math.ceil((maxZ-minZ)/voxelSize)+1;

    const voxSet=new Set();
    faces.forEach(f=>{
      const tris=f.map(i=>vertices[i]);
      const bb=[
        Math.floor((Math.min(...tris.map(v=>v[0]))-minX)/voxelSize),
        Math.floor((Math.min(...tris.map(v=>v[1]))-minY)/voxelSize),
        Math.floor((Math.min(...tris.map(v=>v[2]))-minZ)/voxelSize),
        Math.floor((Math.max(...tris.map(v=>v[0]))-minX)/voxelSize),
        Math.floor((Math.max(...tris.map(v=>v[1]))-minY)/voxelSize),
        Math.floor((Math.max(...tris.map(v=>v[2]))-minZ)/voxelSize)
      ];
      for(let x=bb[0];x<=bb[3];x++)
        for(let y=bb[1];y<=bb[4];y++)
          for(let z=bb[2];z<=bb[5];z++) voxSet.add(`${x},${y},${z}`);
    });

    const voxels=[]; voxSet.forEach(k=>{
      const [x,y,z]=k.split(\",\").map(Number);
      voxels.push({x,y,z,c:1});
    });

    return new VoxModel(sizeX,sizeY,sizeZ,voxels);
  }

  /*** Download Helper *******************************************************/
  function saveBlob(data, filename){
    const blob = (data instanceof ArrayBuffer) ? new Blob([data]) : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.style.display='none';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1000);
  }

  /*** Export ***************************************************************/
  const API={parseVox,buildVox,voxToOBJ,objToVox,saveBlob,VoxModel};
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  else { global.VoxelShaperIO=API; }

})(typeof window!=="undefined"?window:this);
