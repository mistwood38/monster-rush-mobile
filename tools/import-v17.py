"""Import validated V1.7 source into compact, foot-anchored runtime atlases.
Usage: python3 tools/import-v17.py source-pack/v1.7/combined
Only runtime assets are exported; demo/poster/legacy duplicates stay in source.
"""
import json,sys,math,shutil,hashlib
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);baseline=root/'02_V1.7_统一美术与动画/baseline_v16';out=Path('assets/v17');out.mkdir(parents=True,exist_ok=True)
m=json.loads((baseline/'docs/animation_manifest_webp.json').read_text())['animation_definitions'];catalog={'version':'v1.7-integrated-1','actors':{},'static':{},'audio':{},'source':'codex-assets-v1.7@2a1518d','releaseArtComplete':False}
allpaths=[];metrics=[]
def atlas(key,clips,pivot=None,maxsize=192,base=baseline):
 frames=list(dict.fromkeys(f for clip in clips.values() for f in clip['frames']));images={f:Image.open(base/f).convert('RGBA') for f in frames}
 bounds=[im.getbbox() for im in images.values() if im.getbbox()];box=(max(0,min(b[0] for b in bounds)-4),max(0,min(b[1] for b in bounds)-4),min(next(iter(images.values())).width,max(b[2] for b in bounds)+4),min(next(iter(images.values())).height,max(b[3] for b in bounds)+4))
 w,h=box[2]-box[0],box[3]-box[1];scale=min(1,maxsize/max(w,h));cw,ch=math.ceil(w*scale),math.ceil(h*scale);cols=min(6,math.ceil(math.sqrt(len(frames)*ch/cw)));rows=math.ceil(len(frames)/cols);sheet=Image.new('RGBA',(cols*(cw+4),rows*(ch+4)))
 refs={}
 for i,f in enumerate(frames):
  im=images[f].crop(box).resize((cw,ch),Image.Resampling.LANCZOS);x=(i%cols)*(cw+4)+2;y=(i//cols)*(ch+4)+2;sheet.paste(im,(x,y));refs[f]=[x,y,cw,ch]
 file=key.replace('/','_')+'.webp';sheet.save(out/file,'WEBP',quality=88,method=6);allpaths.append('./assets/v17/'+file)
 source_size=next(iter(images.values())).size;pivot=pivot or [source_size[0]/2,source_size[1]*.91];anchor=[(pivot[0]-box[0])/w,(pivot[1]-box[1])/h]
 catalog['actors'][key]={'file':file,'size':list(sheet.size),'aspect':cw/ch,'anchor':anchor,'clips':{name:{'fps':clip['fps'],'loop':clip['loop'],'frames':[refs[f] for f in clip['frames']]} for name,clip in clips.items()},'status':'INTEGRATED_TECHNICAL_CANDIDATE','sourceFrames':frames,'crop':list(box)}
 metrics.append({'key':key,'frames':len(frames),'atlas':list(sheet.size),'gpuBytesRGBA':sheet.width*sheet.height*4,'bytes':(out/file).stat().st_size})
for k,v in m['actors'].items():atlas('actor/'+k,v['animations'],[256,602],192)
for k,v in m['enemies'].items():atlas('enemy/'+k,v['animations'],v['anchor'],144)
atlas('boss',m['boss_animations']['animations'],[256,282],224)
for k,v in m['pets'].items():
 for tier,stage in v['stages'].items():atlas('pet/'+k+'/'+tier,stage['animations'],stage['anchor'],96)
for k,v in m['armors'].items():atlas('armor/'+k,v['animations'],v['anchor'],176)
# The independent patch is reviewed and included for portraits, not silently used as wrong-angle combat animation.
patch=root/'02_V1.7_统一美术与动画/independent_class_patch_v17'
for role in ['assault','heavy','guardian']:
 src=patch/'actors'/role/'idle_00.png';file='portrait_'+role+'.webp';im=Image.open(src);im.thumbnail((128,160));im.save(out/file,'WEBP',quality=88);catalog['static']['portrait/'+role]=file;allpaths.append('./assets/v17/'+file)
paths=['backgrounds/road_surface_seamless.webp','backgrounds/road_lane_overlay.webp','backgrounds/road_tile_01_standard.webp','backgrounds/road_tile_02_cool_variant.webp','backgrounds/city_side_left_nonloop.webp','backgrounds/city_side_right_nonloop.webp']
paths += [str(f.relative_to(baseline/'runtime_webp')) for f in (baseline/'runtime_webp/gates').glob('*.webp')]
paths += [str(f.relative_to(baseline/'runtime_webp')) for folder in ['props','weapons','ui/icons'] for f in (baseline/'runtime_webp'/folder).rglob('*.webp')]
paths += [str(f.relative_to(baseline/'runtime_webp')) for f in (baseline/'runtime_webp/vfx').glob('*.webp') if any(t in f.name for t in ['muzzle','impact','electric_chain','shield_pulse','heal_pulse','fire_burst'])]
for p in paths:
 file=p.replace('/','_');shutil.copyfile(baseline/'runtime_webp'/p,out/file);catalog['static'][p.removesuffix('.webp')]=file;allpaths.append('./assets/v17/'+file)
for f in (baseline/'audio').rglob('*.ogg'):
 file='audio_'+f.stem+'.ogg';shutil.copyfile(f,out/file);catalog['audio'][f.stem]=file;allpaths.append('./assets/v17/'+file)
(out/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')));allpaths.append('./assets/v17/catalog.json')
Path('v17-cache.js').write_text('self.V17_FILES = '+json.dumps(allpaths)+';\n')
Path('docs/v17/atlas-metrics.json').write_text(json.dumps({'atlases':metrics,'totalGpuRGBA':sum(a['gpuBytesRGBA'] for a in metrics),'totalFiles':len(allpaths),'totalBytes':sum((Path(p[2:])).stat().st_size for p in allpaths)},indent=2))
for name in ['01_GAME_DESIGN_CN.md','02_ART_PRODUCTION_PLAN_CN.md','03_ACCEPTANCE_CHECKLIST_CN.md','balance_config_v1.json']:shutil.copyfile(root/'01_正式游戏设计'/name,Path('docs/v17')/name)
shutil.copyfile(root/'01_正式游戏设计/balance_config_v1.json','config/balance-v17.json')
Path('config/balance-v17.js').write_text('// Imported unmodified numeric design baseline; measured tuning is documented separately.\nexport const BALANCE = '+json.dumps(json.loads((root/'01_正式游戏设计/balance_config_v1.json').read_text()),ensure_ascii=False,indent=2)+';\n')
shutil.copyfile(baseline/'src/sprite_state_machine.mjs','sprite-state.mjs')
Path('tests/source-sprite-state.test.mjs').write_text((baseline/'tests/sprite_state_machine.test.mjs').read_text().replace('../src/sprite_state_machine.mjs','../sprite-state.mjs'))
print(json.dumps({'atlases':len(metrics),'compressedBytes':sum(f.stat().st_size for f in out.iterdir()),'gpuBytes':sum(a['gpuBytesRGBA'] for a in metrics),'frames':sum(a['frames'] for a in metrics)},indent=2))
