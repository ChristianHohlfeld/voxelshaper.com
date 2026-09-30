from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
old = '''                    const projectData = data.project_json;
                    if (!projectData || !projectData.voxels || typeof projectData.voxels !== \'object\') {
                        throw new Error("Invalid or empty project data received from API.");
                    }

                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                    const raw = [];
                    for (const key in projectData.voxels) {
                        if (Object.prototype.hasOwnProperty.call(projectData.voxels, key)) {
                            const coords = key.split(',').map(Number);
                            if (coords.length === 3) {
                                const [x, y, z] = coords;
                                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
                                raw.push({ x, y, z, color: projectData.voxels[key] });'''
new = '''                    const projectData = data.projectData || data.project_json || data.project || data;
                    const srcVoxels = projectData && (projectData.voxels || projectData.voxelMap);
                    if (!srcVoxels || (typeof srcVoxels !== \'object\')) {
                        throw new Error("Invalid or empty project data received from API.");
                    }

                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                    const raw = [];
                    const pushVoxel = (x, y, z, color) => {
                        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
                        raw.push({ x, y, z, color: color || \'#888888\' });
                        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
                        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
                    };
                    if (Array.isArray(srcVoxels)) {
                        srcVoxels.forEach((v) => {
                            if (!v || typeof v !== \'object\') return;
                            pushVoxel(Number(v.x), Number(v.y), Number(v.z), v.color || v.hex);
                        });
                    } else {
                    for (const key in srcVoxels) {
                        if (Object.prototype.hasOwnProperty.call(srcVoxels, key)) {
                            const coords = String(key).split(',').map(Number);
                            if (coords.length === 3) {
                                const [x, y, z] = coords;
                                pushVoxel(x, y, z, srcVoxels[key]);'''
# The original continues with min/max inside the loop; we already handle that in pushVoxel.
# After the inner color push we must not duplicate min/max lines that follow in original.
# Keep original min/max lines harmless (they still run for map path).
if old not in t:
    raise SystemExit('target block not found')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('patched', t.count('Array.isArray(srcVoxels)'))
