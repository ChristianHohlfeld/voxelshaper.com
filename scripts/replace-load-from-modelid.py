from pathlib import Path
p = Path('index.html')
text = p.read_text(encoding='utf-8')
start = text.find('            loadProjectFromModelId: async function (modelId) {')
end = text.find('            onPointerLockChange: function () {')
if start < 0 or end < start:
    raise SystemExit(f'markers missing start={start} end={end}')
new = '''            loadProjectFromModelId: async function (modelId) {
                this.showToast('Loading Project...', `Fetching model ${modelId}`, 'info');
                try {
                    const data = await this.request(`/api/models/${modelId}`);
                    const project = data.projectData || data.project_json || data.project || data;
                    if (!this.applyHubImportProject(project, { method: 'modelId' })) {
                        throw new Error('Invalid or empty project data received from API.');
                    }
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
text = text[:start] + new + text[end:]
p.write_text(text, encoding='utf-8')
print('replaced loader', start, '->', start + len(new))
