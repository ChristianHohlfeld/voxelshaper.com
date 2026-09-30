from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
broken = '''applyHubImportProject: function (project, options = {
                project = this.remapCatalogZUpToYUp(project);}) {'''
fixed = '''applyHubImportProject: function (project, options = {}) {
                project = this.remapCatalogZUpToYUp(project);'''
if broken in t:
    t = t.replace(broken, fixed, 1)
    print('syntax fixed')
elif 'remapCatalogZUpToYUp(project);}) {' in t:
    t = t.replace(
        'options = {\n                project = this.remapCatalogZUpToYUp(project);}) {',
        'options = {}) {\n                project = this.remapCatalogZUpToYUp(project);',
        1,
    )
    print('syntax loose')
else:
    print('syntax already ok or different')

watch = '''<script>
(function(){
  function hideBoot(){
    var el=document.getElementById('bootLoadingOverlay');
    if(!el) return;
    el.classList.add('hidden');
    el.style.display='none';
    try { el.remove(); } catch (e) {}
  }
  window.__hideBootLoading = hideBoot;
  setTimeout(hideBoot, 8000);
  window.addEventListener('error', function(){ setTimeout(hideBoot, 300); });
})();
</script>'''
if 'window.__hideBootLoading' not in t:
    marker = '<div id="bootLoadingOverlay"'
    i = t.find(marker)
    if i < 0:
        raise SystemExit('overlay missing')
    # insert script after overlay block closing - after editor-theme-overlay start is fine too
    end = t.find('id="editor-theme-overlay"')
    if end < 0:
        t = t.replace(marker, watch + '\n    ' + marker, 1)
    else:
        t = t[:end] + watch + '\n    ' + t[end:]
    print('watchdog')
else:
    print('watchdog exists')

# hide overlay on model load failure
old = '''                } catch (error) {
                    console.error('Failed to load project from Hub:', error);
                    this.showToast('Load Error', error.message, 'error');'''
new = '''                } catch (error) {
                    console.error('Failed to load project from Hub:', error);
                    this.showToast('Load Error', error.message || 'Model not found', 'error');
                    try { this.hideBootLoading(); } catch (_) {}
                    try { window.__hideBootLoading && window.__hideBootLoading(); } catch (_) {}'''
if old in t:
    t = t.replace(old, new, 1)
    print('catch hide')
else:
    print('catch miss')
p.write_text(t, encoding='utf-8')
print('ok')
