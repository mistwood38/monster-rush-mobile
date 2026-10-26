"""Self-contained candidate built from the actual game modules; no deployment.
python tools/build-art-review.py /path/Monster-Rush-Art-Review.html
"""
import base64,json,re,sys,posixpath
from pathlib import Path
root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]) if len(sys.argv)>1 else root/'test-results/art-rebuild/Monster-Rush-Art-Review.html'
def data(p,mime):return 'data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode()
def safe(x):return json.dumps(x,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
modules={}
pattern=re.compile(r'''(\bfrom\s+|\bimport\s*\(\s*)(["'])(\.[^"']+)(["'])''')
def walk(file):
 key='mr/'+file
 if key in modules:return key
 modules[key]=''
 s=(root/file).read_text()
 def resolve(m):
  dep=posixpath.normpath(posixpath.join(posixpath.dirname(file),m[3]));return m[1]+m[2]+walk(dep)+m[4]
 s=pattern.sub(resolve,s)
 if file=='sprites.js':
  start=s.index('    const response = await fetch(url);');end=s.index('    await Promise.all(',start);s=s[:start]+'    const library=new SpriteLibrary(window.__MR_REVIEW_CATALOG__, "");\n'+s[end:];s=s.replace('this.base + path,','window.__MR_REVIEW_ASSETS__[path],')
 if file=='audio.js':s=s.replace('new URL("./assets/v17/audio_" + name + ".ogg", import.meta.url)','window.__MR_REVIEW_ASSETS__["audio_"+name+".ogg"]')
 if file=='config/catalog.js':s=s.replace('"./assets/v17/ui_icons_trait_" + icons[a.id] + ".webp"','window.__MR_REVIEW_ASSETS__["ui_icons_trait_"+icons[a.id]+".webp"]')
 if file=='game.js':s=re.sub(r'"serviceWorker"\s+in\s+navigator\s*&&\s*location.protocol.startsWith\("http"\)','false /* no offline review service worker */',s)
 modules[key]=s
 return key
walk('game.js')
assets={p.name:data(p,'image/webp' if p.suffix=='.webp' else 'audio/ogg') for p in (root/'assets/v17').iterdir() if p.suffix in ['.webp','.ogg']}
rebuilt={str(p.relative_to(root/'assets/rebuild')):data(p,'model/gltf-binary' if p.suffix=='.glb' else 'image/jpeg') for folder in ['models','textures'] for p in (root/'assets/rebuild'/folder).iterdir() if p.suffix in ['.glb','.jpg']}
bootstrap='<script>window.__MR_REVIEW_ART__=true;window.__MR_REVIEW_ASSETS__='+safe(assets)+';window.__MR_ART_ASSETS__='+safe(rebuilt)+';window.__MR_REVIEW_CATALOG__='+(root/'assets/v17/catalog.json').read_text()+';const modules='+safe(modules)+''';
const imports={};for(const [key,code] of Object.entries(modules))imports[key]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
const entry=document.createElement('script');entry.type='module';entry.textContent='import "mr/game.js";';document.body.append(entry);
</script>'''
html=(root/'index.html').read_text();html=re.sub(r'<link[^>]*rel="(?:manifest|icon)"[^>]*>','',html)
css=(root/'style.css').read_text().replace('url("./assets/backgrounds/highway_day.webp")','none').replace('./assets/fonts/NotoSansSC-UI.woff',data(root/'assets/fonts/NotoSansSC-UI.woff','font/woff'))
html=html.replace('<link rel="stylesheet" href="./style.css" />','<style>'+css+'</style>').replace('<script type="module" src="./game.js"></script>',bootstrap).replace('<title>','<title>美术样板 · ')
html=html.replace('</head>','<link rel="icon" href="'+data(root/'icons/icon-192.png','image/png')+'"></head>')
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(html);print(json.dumps({'path':str(output),'bytes':output.stat().st_size,'modules':len(modules),'legacyAssets':len(assets),'rebuiltAssets':len(rebuilt)}))
