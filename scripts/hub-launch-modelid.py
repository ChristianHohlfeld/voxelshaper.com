from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
old = '''                let meta;
                try {
                    meta = this.decodeHubMetadata(encodedMeta);
                } catch (error) {
                    console.error('Failed to decode Hub model metadata:', error);
                    trackEvent('hub_import_failed', { handoff_method: 'url_metadata', reason: 'decode_failed' });
                    return false;
                }

                const modelType = meta.type ? String(meta.type) : undefined;'''
new = '''                let meta;
                try {
                    meta = this.decodeHubMetadata(encodedMeta);
                } catch (error) {
                    console.error('Failed to decode Hub model metadata:', error);
                    trackEvent('hub_import_failed', { handoff_method: 'url_metadata', reason: 'decode_failed' });
                    return false;
                }

                const catalogId = meta.modelId || meta.public_id || meta.model_id || urlParams.get('modelId');
                if (catalogId) {
                    await this.loadProjectFromModelId(String(catalogId));
                    this.hubLaunchLoadedFromUrl = true;
                    return true;
                }

                const modelType = meta.type ? String(meta.type) : undefined;'''
if old in t:
    t = t.replace(old, new, 1)
    print('editor prefers catalog id')
elif 'const catalogId = meta.modelId' in t:
    print('already')
else:
    raise SystemExit('decode block missing')

# also: if modelId query present, already loads first. good.
p.write_text(t, encoding='utf-8')
print('ok')
