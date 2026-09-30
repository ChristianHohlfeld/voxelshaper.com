from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
broken = '''applyHubImportProject: function (project, options = {
                project = this.remapCatalogZUpToYUp(project);}) {'''
fixed = '''applyHubImportProject: function (project, options = {}) {
                project = this.remapCatalogZUpToYUp(project);'''
if broken in t:
    t = t.replace(broken, fixed, 1)
    print('fixed exact')
elif 'remapCatalogZUpToYUp(project);}) {' in t:
    t = t.replace(
        'applyHubImportProject: function (project, options = {\n                project = this.remapCatalogZUpToYUp(project);}) {',
        fixed,
        1,
    )
    if 'remapCatalogZUpToYUp(project);}) {' in t:
        t = t.replace('options = {\n                project = this.remapCatalogZUpToYUp(project);}) {', 'options = {}) {\n                project = this.remapCatalogZUpToYUp(project);', 1)
        print('fixed loose')
    else:
        print('fixed variant')
else:
    print('pattern missing')
    i = t.find('applyHubImportProject: function')
    print(repr(t[i:i+220]))
p.write_text(t, encoding='utf-8')
print('ok')
