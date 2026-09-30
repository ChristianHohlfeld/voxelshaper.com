from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
needle = 'applyHubImportProject: function (project'
if needle not in t:
    needle = 'applyHubImportProject: function(project'
if needle not in t:
    raise SystemExit('applyHubImportProject missing')
if 'mappedFrom: \'z-up\'' in t[t.find(needle):t.find(needle)+2500] or 'spanZ > spanY' in t[t.find(needle):t.find(needle)+1800]:
    print('maybe already')
# insert helper before apply if missing
helper = '''
            remapCatalogZUpToYUp: function (project) {
                if (!project || typeof project !== 'object') return project;
                const src = project.voxels || project.voxelMap;
                const raw = [];
                if (Array.isArray(src)) {
                    for (const v of src) {
                        if (!v) continue;
                        raw.push({ x: Number(v.x)|0, y: Number(v.y)|0, z: Number(v.z)|0, color: v.color || v.hex || '#888888' });
                    }
                } else if (src && typeof src === 'object') {
                    for (const [key, val] of Object.entries(src)) {
                        const p = String(key).split(',').map(Number);
                        if (p.length !== 3 || p.some(n => !Number.isFinite(n))) continue;
                        raw.push({ x: p[0]|0, y: p[1]|0, z: p[2]|0, color: typeof val === 'string' ? val : (val && (val.color || val.hex)) || '#888888' });
                    }
                }
                if (!raw.length) return project;
                let minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
                for (const v of raw) { if(v.y<minY)minY=v.y; if(v.y>maxY)maxY=v.y; if(v.z<minZ)minZ=v.z; if(v.z>maxZ)maxZ=v.z; }
                if ((maxZ-minZ) <= (maxY-minY)) return project;
                project.voxels = raw.map(v => ({ x: v.x, y: v.z, z: v.y, color: v.color }));
                project.voxelMap = undefined;
                project.currentDrawingAxis = 'y';
                project.metadata = Object.assign({}, project.metadata || {}, { up: 'y', mappedFrom: 'z-up' });
                return project;
            },
'''
if 'remapCatalogZUpToYUp:' not in t:
    t = t.replace(needle, helper + needle, 1)
    print('helper')
# call at start of applyHubImportProject
start = t.find(needle)
brace = t.find('{', start)
# insert after first {
insert = '\n                project = this.remapCatalogZUpToYUp(project);'
if 'remapCatalogZUpToYUp(project)' not in t[start:start+400]:
    t = t[:brace+1] + insert + t[brace+1:]
    print('call')
else:
    print('call exists')
p.write_text(t, encoding='utf-8')
print('ok')
