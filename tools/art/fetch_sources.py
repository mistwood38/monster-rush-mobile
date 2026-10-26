"""Fetch audited upstream CC0 sources. Runtime needs no CDN or API.
python tools/art/fetch_sources.py /path/to/source-workspace
"""
import urllib.request,zipfile,concurrent.futures,pathlib,json,sys,hashlib
SRC=pathlib.Path(sys.argv[1]);SRC.mkdir(parents=True,exist_ok=True)
ROOT=pathlib.Path(__file__).resolve().parents[2];TEX=ROOT/'assets/rebuild/textures';TEX.mkdir(parents=True,exist_ok=True)
items=[('soldiers.zip','https://opengameart.org/sites/default/files/Sci-fi%20Soldiers.zip'),('cyborg.zip','https://opengameart.org/sites/default/files/EvilCyborg.zip'),('horror.zip','https://opengameart.org/sites/default/files/Poses.zip')]
def get(item):
 name,url=item;path=SRC/name
 if not path.exists():urllib.request.urlretrieve(url,path)
 if path.suffix=='.zip':
  with zipfile.ZipFile(path) as z:z.extractall(SRC/path.stem)
 return {'file':name,'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:audit=list(ex.map(get,items))
for slug in ['asphalt_02','damaged_concrete_floor','rusty_metal_02']:
 req=urllib.request.Request('https://api.polyhaven.com/files/'+slug,headers={'User-Agent':'MonsterRushArtRebuild/1.0'})
 data=json.load(urllib.request.urlopen(req,timeout=45))
 for kind in ['Diffuse','nor_gl','Rough']:
  url=data[kind]['1k']['jpg']['url'];path=TEX/(slug+'_'+kind+'.jpg');urllib.request.urlretrieve(url,path)
  audit.append({'file':str(path.relative_to(ROOT)),'url':url,'upstream_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(SRC/'sources.json').write_text(json.dumps(audit,indent=2));print(json.dumps(audit,indent=2),flush=True)
