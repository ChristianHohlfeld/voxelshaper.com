from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
broken = '''    <div <script>
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
</script>
    id="editor-theme-overlay" class="absolute inset-0 pointer-events-none z-[15]">'''
fixed = '''    <script>
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
</script>
    <div id="editor-theme-overlay" class="absolute inset-0 pointer-events-none z-[15]">'''
if broken in t:
    t = t.replace(broken, fixed, 1)
    print('fixed exact')
elif '<div <script>' in t:
    t = t.replace('<div <script>', '<script>', 1)
    t = t.replace('</script>\n    id="editor-theme-overlay"', '</script>\n    <div id="editor-theme-overlay"', 1)
    print('fixed loose')
else:
    print('pattern missing')
    i = t.find('editor-theme-overlay')
    print(repr(t[i-180:i+80]))
p.write_text(t, encoding='utf-8')
print('ok')
