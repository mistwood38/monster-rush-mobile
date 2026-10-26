"""Audited CC0 textured meshes + project-authored skeletal clips -> local GLB.
Run with Blender's Python (bpy 4.3, numpy<2, Pillow):
  python tools/art/build_assets.py /absolute/source-workspace
"""
import bpy,math,sys,re,json
from pathlib import Path
from mathutils import Vector,Quaternion
from PIL import Image
SRC=Path(sys.argv[-1]);OUT=Path(__file__).resolve().parents[2]/'assets/rebuild';TEX=OUT/'textures';MOD=OUT/'models'
for p in [TEX,MOD]:p.mkdir(parents=True,exist_ok=True)
def texture(src,name,normal=False):
 p=TEX/(name+'.png');im=Image.open(src).convert('RGB');im.thumbnail((1024,1024));im.save(p,optimize=True);t=bpy.data.images.load(str(p),check_existing=True)
 if normal:t.colorspace_settings.name='Non-Color'
 return t
def material(name,diff=None,norm=None,color=(.15,.18,.20),metal=.5,rough=.6,emission=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 if diff:
  t=n.new('ShaderNodeTexImage');t.image=diff;l.new(t.outputs['Color'],bs.inputs['Base Color'])
 if norm:
  t=n.new('ShaderNodeTexImage');t.image=norm;a=n.new('ShaderNodeNormalMap');a.inputs['Strength'].default_value=.65;l.new(t.outputs['Color'],a.inputs['Color']);l.new(a.outputs['Normal'],bs.inputs['Normal'])
 if emission:bs.inputs['Emission Color'].default_value=(*emission,1);bs.inputs['Emission Strength'].default_value=3
 return m
def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(MOD/name),export_format='GLB',use_selection=True,export_image_format='JPEG',export_jpeg_quality=88,export_animation_mode='ACTIONS',export_frame_step=2,export_def_bones=True)
 print('EXPORTED',name,flush=True)
def aim(arm,name,target):
 p=arm.pose.bones[name];bpy.context.view_layer.update();head=p.head.copy();old=p.matrix.copy();q=old.to_3x3().col[1].normalized().rotation_difference((Vector(target)-head).normalized());mat=(q.to_matrix()@old.to_3x3()).to_4x4();mat.translation=head;p.matrix=mat;bpy.context.view_layer.update()
def key(arm,frame):
 for p in arm.pose.bones:p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name);p.keyframe_insert('location',frame=frame,group=p.name)
def rigid(o,arm,bone,mat):
 o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Rig','ARMATURE');mod.object=arm;return o
def box(name,pos,scale,arm,bone,mat,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Machined edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return rigid(o,arm,bone,mat)
def clips(arm,rest,names,kind='soldier'):
 for name,count in names:
  action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
  for f in range(1,count+1):
   t=(f-1)/(count-1);phase=t*math.tau
   for p in arm.pose.bones:p.rotation_mode='QUATERNION';p.location=rest[p.name][0];p.rotation_quaternion=rest[p.name][1]
   root='joint1' if kind=='stalker' else 'hips';spine='joint2' if kind=='stalker' else 'chest' if kind=='soldier' else 'spine'
   if name=='run' and kind!='stalker':
    for side,sign in [('L',1),('R',-1)]:
     arm.pose.bones['thigh.'+side].rotation_quaternion=rest['thigh.'+side][1]@Quaternion((1,0,0),math.sin(phase)*.42*sign)
     arm.pose.bones['shin.'+side].rotation_quaternion=rest['shin.'+side][1]@Quaternion((1,0,0),max(0,-math.sin(phase)*sign)*.65)
    arm.pose.bones[root].location.z+=abs(math.sin(phase))*.035
   elif name in ['shoot','hit','activate','attack']:
    arm.pose.bones[spine].rotation_quaternion=rest[spine][1]@Quaternion((1,0,0),(.08 if name=='shoot' else .25)*math.sin(t*math.pi))
    if name=='attack' and kind=='revenant':
     for side in ['L','R']:arm.pose.bones['arm.'+side].rotation_quaternion=Quaternion((1,0,0),-1.1*math.sin(t*math.pi))
   elif name=='down':
    arm.pose.bones[root].rotation_quaternion=rest[root][1]@Quaternion((1,0,0),(-1 if kind!='stalker' else 1)*1.4*t)
    if kind=='stalker':arm.pose.bones[root].location.y-=70*t
    else:arm.pose.bones[root].location.z-=.75*t
   else:arm.pose.bones[spine].rotation_quaternion=rest[spine][1]@Quaternion((1,0,0),.013*math.sin(phase))
   key(arm,f)
  for fc in action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'

def soldier():
 bpy.ops.wm.open_mainfile(filepath=str(SRC/'soldiers/Sci-fi Soldiers 2/Mesh.blend'));arm=bpy.data.objects['metarig'];body=bpy.data.objects['Body'];parts=[body,bpy.data.objects['Head3'],bpy.data.objects['HandSimple']]
 for o in list(bpy.data.objects):
  if o not in parts+[arm]:bpy.data.objects.remove(o,do_unlink=True)
 arm.animation_data_clear()
 for p in arm.pose.bones:p.rotation_mode='QUATERNION';p.rotation_quaternion.identity()
 base=SRC/'soldiers/Sci-fi Soldiers 2';ai=TEX/'soldier-base-ai.png';m=material('Titanium / woven suit',texture(ai if ai.exists() else base/'MilitarySkin_Albedo.tga','soldier_base'),texture(base/'MilitarySkin_NormalMap.png','soldier_normal',True),color=(1,1,1),metal=.55)
 for o in parts:
  o.data.materials.clear();o.data.materials.append(m)
  for p in o.data.polygons:p.use_smooth=True
 dark=material('Graphite equipment',color=(.035,.045,.052),metal=.7);glow=material('Amber status strips',color=(.9,.2,.01),emission=(1,.15,.005))
 parts.append(box('Power pack',(0,.23,1.43),(.34,.20,.40),arm,'chest',dark))
 for side in [-1,1]:
  parts.append(box('Belt pouch',(side*.19,-.07,1.01),(.12,.16,.18),arm,'hips',dark))
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.06,depth=.37,location=(side*.2,.26,1.44));parts.append(rigid(bpy.context.object,arm,'chest',dark))
  parts.append(box('Status light',(side*.13,.335,1.44),(.018,.012,.28),arm,'chest',glow,.004))
 for i in range(5):parts.append(box('Vent grille',(0,.34,1.31+i*.05),(.24,.012,.016),arm,'chest',dark,.004))
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='SentinelBody'
 for side,elbow,wrist in [('R',(-.32,-.12,1.36),(-.18,-.40,1.43)),('L',(.33,-.18,1.38),(.03,-.60,1.44))]:aim(arm,'upper_arm.'+side,elbow);aim(arm,'forearm.'+side,wrist)
 rest={p.name:(p.location.copy(),p.rotation_quaternion.copy()) for p in arm.pose.bones};clips(arm,rest,[('run',25),('idle',31),('shoot',9),('hit',9),('down',21),('activate',21)])
 arm.animation_data.action=bpy.data.actions['run'];bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1);export('sentinel.glb',[arm,body])

def stalker():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(SRC/'horror/Poses/Run.fbx'));body=bpy.data.objects['Creature1'];arm=body.parent
 for o in list(bpy.data.objects):
  if o not in [arm,body]:bpy.data.objects.remove(o,do_unlink=True)
 a=arm.animation_data.action;a.name='run'
 for action in list(bpy.data.actions):
  if action!=a:bpy.data.actions.remove(action)
 base=SRC/'horror/Poses/UnityTexture';m=material('Infected tissue',texture(base/'test_StingrayPBS1SG_AlbedoTransparency.png','stalker_base'),texture(base/'test_StingrayPBS1SG_Normal.png','stalker_normal',True),color=(1,1,1),metal=.05,rough=.75);body.data.materials.clear();body.data.materials.append(m)
 for p in body.data.polygons:p.use_smooth=True
 bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(2);bpy.context.view_layer.update();rest={p.name:(p.location.copy(),p.rotation_quaternion.copy()) for p in arm.pose.bones};clips(arm,rest,[('idle',31),('attack',21),('hit',9),('down',21)],'stalker');arm.animation_data.action=a;bpy.context.scene.frame_set(2);export('stalker.glb',[arm,body])
 bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Mobile far LOD','DECIMATE');mod.ratio=.45;bpy.ops.object.modifier_apply(modifier=mod.name);export('stalker-lod.glb',[arm,body])

def revenant():
 bpy.ops.wm.read_factory_settings(use_empty=True);s=(SRC/'cyborg/EvilCyborg/CyborgLowPoly.fbx').read_text()
 def arr(name,ints=False):
  val=re.search(r'\b'+name+r':\s*([-+\d.eE,\s]+)',s)[1];return [(int(x) if ints else float(x)) for x in re.findall(r'[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?',val)]
 vv=arr('Vertices');v=[Vector(vv[i:i+3]) for i in range(0,len(vv),3)];lo=min(p.z for p in v);fac=2.05/(max(p.z for p in v)-lo);verts=[(p.x*fac,p.y*fac,(p.z-lo)*fac) for p in v];faces=[];p=[]
 for i in arr('PolygonVertexIndex',True):
  p.append(i if i>=0 else -i-1)
  if i<0:faces.append(p);p=[]
 mesh=bpy.data.meshes.new('Irondust FBX 6.1 mesh');mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new('Revenant',mesh);bpy.context.collection.objects.link(obj);uv=arr('UV');ui=arr('UVIndex',True);layer=mesh.uv_layers.new(name='UVMap')
 for l in mesh.loops:layer.data[l.index].uv=uv[2*ui[l.index]:2*ui[l.index]+2]
 mesh.validate(clean_customdata=False)
 for p in mesh.polygons:p.use_smooth=True
 base=SRC/'cyborg/EvilCyborg/Textures';m=material('Scarred steel and exposed cable',texture(base/'BossDiffuse.tga','revenant_base'),texture(base/'BossNormalMap.png','revenant_normal',True),color=(1,1,1),metal=.55);mesh.materials.append(m)
 data=bpy.data.armatures.new('Project anatomical rig');arm=bpy.data.objects.new('RevenantRig',data);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT');layout=[('hips',(0,0,.98),(0,0,1.18),None),('spine',(0,0,1.18),(0,0,1.50),'hips'),('head',(0,0,1.61),(0,0,2.01),'spine')]
 for side,sign in [('L',1),('R',-1)]:layout += [(f'arm.{side}',(sign*.29,0,1.53),(sign*.43,0,1.12),'spine'),(f'forearm.{side}',(sign*.43,0,1.12),(sign*.47,-.02,.72),f'arm.{side}'),(f'thigh.{side}',(sign*.18,0,1.01),(sign*.21,0,.54),'hips'),(f'shin.{side}',(sign*.21,0,.54),(sign*.22,0,.12),f'thigh.{side}')]
 for name,head,tail,parent in layout:
  b=data.edit_bones.new(name);b.head=head;b.tail=tail
  if parent:b.parent=data.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 for name,*_ in layout:obj.vertex_groups.new(name=name)
 def dist(p,a,b):
  a=Vector(a);d=Vector(b)-a;return (p-a-d*max(0,min(1,(p-a).dot(d)/d.length_squared))).length
 for vertex in mesh.vertices:
  nearest=sorted((dist(vertex.co,a,b),name) for name,a,b,_ in layout)[:2];vals=[1/(d+.02)**5 for d,n in nearest];total=sum(vals)
  for (d,n),w in zip(nearest,vals):obj.vertex_groups[n].add([vertex.index],w/total,'REPLACE')
 obj.parent=arm;mod=obj.modifiers.new('Skin','ARMATURE');mod.object=arm;rest={p.name:(p.location.copy(),p.rotation_quaternion.copy()) for p in arm.pose.bones};clips(arm,rest,[('run',25),('idle',31),('attack',21),('hit',9),('down',21)],'revenant');arm.animation_data.action=bpy.data.actions['run'];bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1);export('revenant.glb',[arm,obj]);bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'revenant-authored.blend'))
 bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Far LOD','DECIMATE');mod.ratio=.42;bpy.ops.object.modifier_apply(modifier=mod.name);export('revenant-lod.glb',[arm,obj])

def boss():
 bpy.ops.wm.open_mainfile(filepath=str(SRC/'revenant-authored.blend'));arm=bpy.data.objects['RevenantRig'];body=bpy.data.objects['Revenant']
 for v in body.data.vertices:
  if v.co.z>1:v.co.x*=1.25
 shell=material('Obsidian carapace',color=(.06,.07,.08));edge=material('Scored titanium',color=(.32,.30,.28));core=material('Molten core',color=(1,.04,.005),emission=(1,.04,.005))
 def bind(o,bone,m):
  o.data.materials.append(m)
  for p in o.data.polygons:p.use_smooth=True
  world=o.matrix_world.copy();o.parent=arm;o.parent_type='BONE';o.parent_bone=bone;bpy.context.view_layer.update();o.matrix_world=world
 for side in [-1,1]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=(side*.41,0,1.54));o=bpy.context.object;o.scale=(.29,.31,.23);bind(o,'spine',shell)
  for i in range(4):
   start=Vector((side*(.29+i*.09),.1,1.62));end=start+Vector((side*.22,.12,.40-i*.035));d=end-start;bpy.ops.mesh.primitive_cone_add(vertices=10,radius1=.10,radius2=.005,depth=d.length,location=(start+end)/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();bind(o,'spine',edge)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.043,location=(side*.084,-.14,1.91));bind(bpy.context.object,'head',core)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,radius=.14,location=(0,-.22,1.45));bind(bpy.context.object,'spine',core)
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=(0,-.21,1.45),rotation=(math.pi/2,0,0),major_radius=.17,minor_radius=.022);bind(bpy.context.object,'spine',edge)
 export('boss.glb',list(bpy.data.objects))

soldier();stalker();revenant();boss()
