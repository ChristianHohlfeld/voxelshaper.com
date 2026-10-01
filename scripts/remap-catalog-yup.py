from pathlib import Path

p = Path('index.html')
t = p.read_text(encoding='utf-8')
changed = False

# The editor is the storage contract: Hub round-trips must preserve voxel
# coordinates byte-for-byte. A previous patch remapped every Hub import from
# Z-up to Y-up, which turned editor-generated lying models upright after upload
# and then permanently changed their orientation when reopened.
call = "                project = this.remapCatalogZUpToYUp(project);\n"
if call in t:
    t = t.replace(call, '', 1)
    changed = True
    print('removed unconditional Hub import axis remap')

# Keep the old helper name as an explicit no-op for compatibility with any
# stale generated code, but make it impossible to rotate project coordinates.
start_marker = "            remapCatalogZUpToYUp: function (project) {"
apply_marker = "applyHubImportProject: function (project"
start = t.find(start_marker)
if start >= 0:
    end = t.find(apply_marker, start)
    if end < 0:
        raise SystemExit('applyHubImportProject missing after remap helper')
    noop = "            remapCatalogZUpToYUp: function (project) {\n                return project;\n            },\n"
    current = t[start:end]
    if current != noop:
        t = t[:start] + noop + t[end:]
        changed = True
        print('made legacy remap helper a no-op')

if "project = this.remapCatalogZUpToYUp(project);" in t:
    raise SystemExit('unconditional Hub import remap still present')

if changed:
    p.write_text(t, encoding='utf-8')
else:
    print('editor Hub import already preserves axes')
