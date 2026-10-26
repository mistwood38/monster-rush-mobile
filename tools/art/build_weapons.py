"""Original bevelled weapons. Grip origin 0, bore -Z in glTF, muzzle z=-1.04."""
import bpy,math
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'assets/rebuild/models'
for kind in ['rifle','machine','shotgun','plasma','laser']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 def mat(name,c,metal=.7,rough=.4,glow=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
  if glow:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=glow
  return m
 steel=mat('Brushed steel',(.24,.29,.32));dark=mat('Graphite',(.025,.035,.041));grip=mat('Polymer grip',(.055,.057,.053),.15,.85);accent=mat('Capacitor',{'rifle':(.9,.3,.03),'machine':(.95,.45,.04),'shotgun':(.95,.23,.03),'plasma':(.04,.4,.98),'laser':(.99,.04,.025)}[kind],.3,.35,3)
 def box(name,pos,size,m,bevel=.015):
  bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);mod=o.modifiers.new('Machined bevel','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
  for p in o.data.polygons:p.use_smooth=True
  return o
 def barrel(name,x,z,y,r,length,m):
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=length,location=(x,y,z),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name=name;o.data.materials.append(m)
  for p in o.data.polygons:p.use_smooth=True
 box('Receiver',(0,.2,0),(.18,.46,.17),dark);box('Upper rail',(0,.26,.115),(.075,.55,.045),steel);box('Grip',(0,-.025,-.14),(.09,.11,.23),grip);box('Magazine',(.01,.15,-.17),(.105,.18,.25),dark);box('Stock',(0,-.24,.015),(.13,.29,.12),steel);box('Stock pad',(0,-.41,.005),(.17,.055,.19),grip)
 for i in range(7):box('Rail tooth',(0,.025+i*.068,.145),(.11,.035,.025),dark,.004)
 if kind=='machine':
  box('Ammunition cassette',(.18,.14,-.06),(.22,.31,.25),steel)
  for i in range(6):a=i*math.tau/6;barrel('Rotary barrel',math.cos(a)*.065,math.sin(a)*.065,.73,.022,.57,steel)
  barrel('Barrel housing',0,0,.46,.12,.12,dark);barrel('Muzzle ring',0,0,1.01,.11,.07,dark)
 elif kind=='shotgun':
  for x in [-.045,.045]:barrel('Twin bore',x,0,.73,.036,.62,steel)
  box('Pump',(0,.58,-.065),(.17,.23,.11),grip)
 elif kind=='plasma':
  barrel('Accelerator',0,0,.69,.095,.65,dark)
  for y in [.48,.60,.72,.84,.96]:barrel('Induction coil',0,0,y,.112,.028,accent)
  for x in [-.14,.14]:box('Cooling shroud',(x,.69,0),(.065,.55,.19),steel)
 elif kind=='laser':
  box('Prism housing',(0,.65,0),(.23,.6,.18),steel)
  for y in [.47,.61,.75,.89]:box('Emitter',(0,y,.104),(.13,.065,.025),accent,.004)
  barrel('Lens',0,0,1.02,.07,.04,accent)
 else:
  barrel('Rifled barrel',0,0,.73,.026,.62,steel);barrel('Muzzle brake',0,0,1,.043,.08,dark);box('Handguard',(0,.53,0),(.16,.27,.14),grip)
 for x in [-.097,.097]:box('Indicator',(x,.2,.025),(.012,.23,.025),accent,.003)
 bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=next(o for o in bpy.data.objects if o.type=='MESH');bpy.ops.object.join();bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.export_scene.gltf(filepath=str(OUT/('weapon-'+kind+'.glb')),export_format='GLB',export_animations=False)
