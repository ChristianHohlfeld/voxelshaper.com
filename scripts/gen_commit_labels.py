import subprocess, re

commit_hashes = subprocess.check_output(
    ['git', 'log', '--pretty=format:%H', '--reverse', '--', 'index.html']
).decode().splitlines()

keywords = [
    (re.compile(r'og:'), 'social meta update'),
    (re.compile(r'twitter:'), 'social meta update'),
    (re.compile(r'gesture|touch|mobile', re.I), 'gesture/mobile update'),
    (re.compile(r'firebase', re.I), 'firebase update'),
    (re.compile(r'firestore', re.I), 'firestore update'),
    (re.compile(r'auth|login', re.I), 'authentication update'),
    (re.compile(r'modal', re.I), 'modal update'),
    (re.compile(r'controls', re.I), 'controls update'),
    (re.compile(r'drag', re.I), 'drag fix'),
    (re.compile(r'style', re.I), 'style update'),
]

labels = []
prev_hash = commit_hashes[0]
labels.append(f"{prev_hash[:7]} - initial version")
for cur_hash in commit_hashes[1:]:
    diff = subprocess.check_output(['git', 'diff', prev_hash, cur_hash, '--', 'index.html'])
    diff_text = diff.decode('utf-8', errors='ignore')
    summary_parts = []
    for regex, label in keywords:
        if regex.search(diff_text):
            if label not in summary_parts:
                summary_parts.append(label)
    if not summary_parts:
        summary = 'tweak'
    else:
        summary = ', '.join(summary_parts)
    labels.append(f"{cur_hash[:7]} - {summary}")
    prev_hash = cur_hash

with open('generated_commit_labels.txt', 'w') as f:
    f.write('\n'.join(labels))
