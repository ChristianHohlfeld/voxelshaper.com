from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

load_old = """                    const before = this.createProjectSnapshot();
                    if (!this.applyHubImportProject(project, { method: 'modelId', preserveHistory: true })) {
                        throw new Error('Invalid or empty project data received from API.');
                    }
                    const after = this.createProjectSnapshot();
                    this.addHistoryStep({ type: 'MORPH', before, after, meta: { source: 'modelId', modelId } });
"""
load_new = """                    if (!this.applyHubImportProject(project, { method: 'modelId', preserveHistory: false })) {
                        throw new Error('Invalid or empty project data received from API.');
                    }
"""
if load_old not in t:
    print('load block missing or already patched')
else:
    t = t.replace(load_old, load_new, 1)
    print('load history reset')

def patch_assign(src, which):
    old = f"""                                if (existingVoxel) {{
                                    existingVoxel.mesh.material = this.getMaterial(change.{which}.color, change.{which}.glass ? 'glass' : 'solid');
                                    existingVoxel.color = change.{which}.color;
                                    existingVoxel.glass = !!change.{which}.glass;
                                    existingVoxel.mesh.renderOrder = existingVoxel.glass ? 2 : 1;
                                }} else {{
"""
    new = f"""                                if (existingVoxel) {{
                                    existingVoxel.color = change.{which}.color;
                                    existingVoxel.glass = !!change.{which}.glass;
                                    if (existingVoxel.mesh) {{
                                        existingVoxel.mesh.material = this.getMaterial(change.{which}.color, change.{which}.glass ? 'glass' : 'solid');
                                        existingVoxel.mesh.renderOrder = existingVoxel.glass ? 2 : 1;
                                    }} else if (typeof this.updateInstancedVoxelColor === 'function') {{
                                        this.updateInstancedVoxelColor(key, change.{which}.color, !!change.{which}.glass);
                                    }}
                                }} else {{
"""
    if old not in src:
        raise SystemExit(f'assign block {which} missing')
    return src.replace(old, new, 1)

t = patch_assign(t, 'before')
t = patch_assign(t, 'after')
p.write_text(t, encoding='utf-8')
print('undo/redo instanced safe')
