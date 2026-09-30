from pathlib import Path
p = Path('index.html')
text = p.read_text(encoding='utf-8')

norm_start = text.find('            normalizeHubProjectPayload: function')
norm_end = text.find('            getHubAutosaveKey: function')
if norm_start < 0 or norm_end < norm_start:
    raise SystemExit('normalize markers missing')

load_start = text.find('            loadProjectFromModelId: async function')
load_end = text.find('            onPointerLockChange: function')
if load_start < 0 or load_end < load_start:
    raise SystemExit('load markers missing')

norm = '''            normalizeHubProjectPayload: function (project) {
                if (!project || typeof project !== 'object') return null;
                let voxels = project.voxels;
                if (!Array.isArray(voxels) && project.voxelMap && typeof project.voxelMap === 'object' && !Array.isArray(project.voxelMap)) {
                    voxels = Object.entries(project.voxelMap).map(([key, color]) => {
                        const [x, y, z] = String(key).split(',').map(Number);
                        const hex = typeof color === 'string' ? color : (color && (color.color || color.hex)) || '#FFFFFF';
                        return { x, y, z, color: hex };
                    });
                } else if (voxels && typeof voxels === 'object' && !Array.isArray(voxels)) {
                    voxels = Object.entries(voxels).map(([key, color]) => {
                        const [x, y, z] = String(key).split(',').map(Number);
                        const hex = typeof color === 'string' ? color : (color && (color.color || color.hex)) || '#FFFFFF';
                        return { x, y, z, color: hex };
                    });
                }
                if (!Array.isArray(voxels) || !voxels.length) return null;
                const cleaned = voxels.map((v) => {
                    if (!v || typeof v !== 'object') return null;
                    let color = typeof v.color === 'string' ? v.color : (v.hex || '#FFFFFF');
                    if ((!color || color[0] !== '#') && Array.isArray(v.c) && v.c.length >= 3) {
                        const toHex = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
                        color = `#${toHex(v.c[0])}${toHex(v.c[1])}${toHex(v.c[2])}`;
                    }
                    const x = Number(v.x), y = Number(v.y), z = Number(v.z);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
                    return { x, y, z, color: String(color || '#FFFFFF').toUpperCase() };
                }).filter(Boolean);
                if (!cleaned.length) return null;
                return {
                    ...project,
                    gridSize: project.gridSize || this.GRID_DEFAULT,
                    currentDrawingAxis: project.currentDrawingAxis || 'y',
                    activeDrawingLevel: project.activeDrawingLevel || { x: 0, y: 0, z: 0 },
                    voxels: cleaned,
                    metadata: project.metadata
                };
            },

'''

load = '''            loadProjectFromModelId: async function (modelId) {
                this.showToast('Loading Project...', `Fetching model ${modelId}`, 'info');
                try {
                    const data = await this.request(`/api/models/${modelId}`);
                    const project = data.projectData || data.project_json || data.project || data;
                    const before = this.createProjectSnapshot();
                    if (!this.applyHubImportProject(project, { method: 'modelId', preserveHistory: true })) {
                        throw new Error('Invalid or empty project data received from API.');
                    }
                    const after = this.createProjectSnapshot();
                    this.addHistoryStep({ type: 'MORPH', before, after, meta: { source: 'modelId', modelId } });
                    this.currentModelId = modelId;
                    this.hubUploadDirty = false;
                    this.lastHubUploadAt = Date.now();
                    this.updateHubSaveIndicator();
                    this.updateUrlWithModelId();
                    this.showToast('Project Loaded', `Loaded "${data.name || modelId}"`, 'info');
                } catch (error) {
                    console.error('Failed to load project from Hub:', error);
                    this.showToast('Load Error', error.message, 'error');
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('modelId');
                    window.history.replaceState({}, document.title, cleanUrl.href);
                }
            },

'''

text = text[:norm_start] + norm + text[norm_end:]
# reload indices after first splice
load_start = text.find('            loadProjectFromModelId: async function')
load_end = text.find('            onPointerLockChange: function')
if load_start < 0 or load_end < load_start:
    raise SystemExit('load markers missing after norm splice')
text = text[:load_start] + load + text[load_end:]
p.write_text(text, encoding='utf-8')
print('patched normalize + loader')
