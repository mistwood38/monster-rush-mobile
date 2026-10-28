"""Fetch Poly Haven's CC0 1k car and pack unchanged glTF components into GLB.
The online API is used only at build time; the game uses the local GLB.
"""
import hashlib,json,pathlib,struct,urllib.request,sys
root=pathlib.Path(__file__).resolve().parents[2]
headers={'User-Agent':'MonsterRushArtRebuild/1.0'}
def fetch(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=90) as response:return response.read()
manifest=json.loads(fetch('https://api.polyhaven.com/files/covered_car'))['gltf']['1k']['gltf']
files={}
for name,item in [('covered_car_1k.gltf',manifest),*manifest['include'].items()]:
 data=fetch(item['url']);digest=hashlib.md5(data).hexdigest()
 if digest!=item['md5']:raise ValueError('Source hash differs: '+name)
 files[name]=data
 print(name,len(data),digest,flush=True)
g=json.loads(files['covered_car_1k.gltf']);assert len(g['buffers'])==1
binary=bytearray(files[g['buffers'][0]['uri']])
for image in g['images']:
 uri=image.pop('uri');data=files[uri]
 while len(binary)%4:binary.append(0)
 image['bufferView']=len(g['bufferViews']);image['mimeType']='image/jpeg' if uri.lower().endswith(('.jpg','.jpeg')) else 'image/png';g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
g['buffers'][0].pop('uri');g['buffers'][0]['byteLength']=len(binary)
while len(binary)%4:binary.append(0)
js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
out=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
p=root/'assets/rebuild/models/covered-car.glb';p.write_bytes(out)
(root/'docs/art-rebuild/covered-car-source.json').write_text(json.dumps({'author':'MP','asset':'Covered Car','license':'CC0-1.0','source':'https://polyhaven.com/a/covered_car','version':'1k glTF; packaged into GLB without changing mesh or maps','files':[{'name':n,'url':item['url'],'md5':item['md5'],'sha256':hashlib.sha256(files[n]).hexdigest()} for n,item in [('covered_car_1k.gltf',manifest),*manifest['include'].items()]],'glb_sha256':hashlib.sha256(out).hexdigest()},indent=2))
print('Wrote',p,len(out),'bytes')
