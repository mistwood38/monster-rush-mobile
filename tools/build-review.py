"""Build a self-contained review artifact, without publishing or a local server.
Gameplay source is reused. Only asset resolution and the PWA registration differ.
Run: python3 tools/build-review.py [output.html]
"""
import base64
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'test-results/monster-rush-review.html'
modules = {}
paths = {
    'mr/three': 'vendor/three/three.module.min.js',
    'mr/audio': 'audio.js', 'mr/sprites': 'sprites.js',
    'mr/fsm': 'sprite-state.mjs', 'mr/systems': 'systems.js',
    'mr/catalog': 'config/catalog.js', 'mr/balance': 'config/balance-v17.js',
    'mr/game': 'game.js',
}
replacements = {
    './vendor/three/three.module.min.js': 'mr/three',
    './audio.js': 'mr/audio', './sprites.js': 'mr/sprites',
    './sprite-state.mjs': 'mr/fsm', './systems.js': 'mr/systems',
    './config/catalog.js': 'mr/catalog', './balance-v17.js': 'mr/balance',
}
for key, file in paths.items():
    source = (root / file).read_text()
    for old, new in replacements.items():
        source = source.replace('"' + old + '"', '"' + new + '"').replace("'" + old + "'", "'" + new + "'")
    if key == 'mr/sprites':
        start = source.index('    const response = await fetch(url);')
        end = source.index('    await Promise.all(', start)
        source = source[:start] + '    const library=new SpriteLibrary(window.__MR_REVIEW_CATALOG__, "");\n' + source[end:]
        source = source.replace('this.base + path,', 'window.__MR_REVIEW_ASSETS__[path],')
    if key == 'mr/audio':
        source = source.replace('new URL("./assets/v17/audio_" + name + ".ogg", import.meta.url)', 'window.__MR_REVIEW_ASSETS__["audio_"+name+".ogg"]')
    if key == 'mr/catalog':
        source = source.replace('"./assets/v17/ui_icons_trait_" + icons[a.id] + ".webp"', 'window.__MR_REVIEW_ASSETS__["ui_icons_trait_"+icons[a.id]+".webp"]')
    if key == 'mr/game':
        source = re.sub(r'"serviceWorker"\s+in\s+navigator\s*&&\s*location.protocol.startsWith\("http"\)', 'false /* Review artifact has no service worker */', source)
    modules[key] = source
assets = {}
for file in (root / 'assets/v17').iterdir():
    if file.suffix not in ['.webp', '.ogg']:
        continue
    mime = 'image/webp' if file.suffix == '.webp' else 'audio/ogg'
    assets[file.name] = 'data:' + mime + ';base64,' + base64.b64encode(file.read_bytes()).decode()
def safe_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
bootstrap = '<script>window.__MR_REVIEW_ASSETS__=' + safe_json(assets) + ';window.__MR_REVIEW_CATALOG__=' + (root / 'assets/v17/catalog.json').read_text() + ';const modules=' + safe_json(modules) + ''';
const imports={};for(const [key,code] of Object.entries(modules))imports[key]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
const entry=document.createElement('script');entry.type='module';entry.textContent='import "mr/game";';document.body.append(entry);
</script>'''
html = (root / 'index.html').read_text()
html = re.sub(r'<link[^>]*rel="(?:manifest|icon)"[^>]*>', '', html)
css = (root / 'style.css').read_text().replace('url("./assets/backgrounds/highway_day.webp")', 'none')
html = html.replace('<link rel="stylesheet" href="./style.css" />', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="./game.js"></script>', bootstrap)
html = html.replace('<title>', '<title>离线审查 · ')
html = html.replace('</head>', '<link rel="icon" href="data:image/png;base64,'+base64.b64encode((root/'icons/icon-192.png').read_bytes()).decode()+'"></head>')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'modules': len(modules), 'embeddedAssets': len(assets)}))
