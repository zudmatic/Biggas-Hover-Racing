"""Run through Blender MCP in the Step 25/26 scene. Export copies, never edit authorship data."""
import bpy, json, math
from pathlib import Path
from mathutils import Matrix

ROOT=next(p for p in Path(bpy.data.filepath).parents if(p/'package.json').exists())
OUT=ROOT/'output/desert-detail-export';OUT.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'public/models/desert-valley'
kit=json.loads((ROOT/'assets/maps/desert-valley/vegetation-upgrade/kit-manifest.json').read_text())
game=bpy.context.scene;dg=bpy.context.evaluated_depsgraph_get()
conversion=Matrix.Rotation(-math.pi/2,4,'X');inverse=conversion.inverted()
families=[];by_mesh={};copies=[];meshes=[]
def family(key,objects,source,distances,cull,role='vegetation'):
    f={'id':key,'nodes':[],'triangles':[],'distances':distances,'cullDistance':cull,'role':role,'placements':[]}
    families.append(f);by_mesh[source.data.as_pointer()]=f
    f['_objects']=objects
    return f
for e in kit:
    name=e['source'];key=name.removeprefix('SM_').removesuffix('_S07')
    distances,cull=([55,150],600)if'DatePalm'in name else([35,100],360)if'Cactus'in name or'Saguaro'in name else([12,32],90)if'Grass'in name or'grass'in name else([22,60],180)
    family(key,[bpy.data.objects[x['object']]for x in e['levels']],bpy.data.objects[name],distances,cull)
family('Saguaro_Ribbed',[bpy.data.objects['SM_S23_Saguaro_Ribbed_LOD'+str(i)]for i in range(3)],bpy.data.objects['SM_S23_Saguaro_Ribbed_LOD0'],[35,100],360)
for n in range(4):
    name='SM_S23_SandstoneBlock_'+str(n).zfill(2)
    family('SandstoneBlock_'+str(n),[bpy.data.objects[name+'_LOD'+str(i)]for i in range(3)],bpy.data.objects[name+'_LOD0'],[35,95],280,'rock')
mesa=bpy.data.objects['SM_S23_SouthernMesa_LOD0']
f=family('SouthernMesa',[bpy.data.objects['SM_S23_SouthernMesa_LOD'+str(i)]for i in range(3)],mesa,[100,260],None,'mesa')
f['replacesSource']='S07_CLIFF - Southern central mesa'
rock_families=json.loads(game.get('s27_detail_manifest','[]'))
for rock in rock_families:
    objects=[bpy.data.objects[name] for name in rock['objects']]
    f=family(rock['id'],objects,objects[0],rock['distances'],None,'mesa')
    f['replacesSource']=rock['source']
def matrix_list(m):
    # Three.Matrix4.fromArray expects column-major order.
    m=conversion@m@inverse
    return [round(m[row][col],7)for col in range(4)for row in range(4)]
for inst in dg.object_instances:
    o=inst.object.original
    if o.type!='MESH':continue
    f=by_mesh.get(o.data.as_pointer())
    if f and(inst.is_instance or o==mesa or o.get('s27_detail')):
        f['placements'].append({'matrix':matrix_list(inst.matrix_world),'source':o.name,'parent':inst.parent.original.name if inst.parent else o.name})
replacements=[o for o in game.objects if o.type=='MESH'and o.visible_get()and o!=mesa and not o.get('s27_detail') and any(m and m.name=='MAT_S23_Sandstone_Game'for m in o.data.materials)]

# glTF multiplies COLOR_0 with baseColorTexture natively. Use a direct image
# connection on this export-only material; no procedural MixRGB dependency.
veg=bpy.data.materials['MAT_S25_Vegetation_SharedAtlas'].copy();veg.name='MAT_DesertVegetation_Atlas_Game'
bs=next(n for n in veg.node_tree.nodes if n.type=='BSDF_PRINCIPLED');tex=next(n for n in veg.node_tree.nodes if n.type=='TEX_IMAGE')
veg.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
export_scene=bpy.data.scenes.new('TEMP_S26_DetailExport');bpy.context.window.scene=export_scene
def export_copy(source,name,world=False,role='vegetation'):
    ev=source.evaluated_get(dg);me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=dg)
    if world:me.transform(source.matrix_world)
    if role=='vegetation':
        me.materials.clear();me.materials.append(veg)
        if 'Color'in me.color_attributes:
            me.color_attributes.active_color=me.color_attributes['Color']
            me.color_attributes.render_color_index=list(me.color_attributes.keys()).index('Color')
    else:
        for a in list(me.color_attributes):me.color_attributes.remove(a)
    me.calc_loop_triangles()
    if any(not all(math.isfinite(x)for x in v.co)for v in me.vertices):raise ValueError('Non-finite geometry: '+name)
    ob=bpy.data.objects.new(name,me);export_scene.collection.objects.link(ob);copies.append(ob);meshes.append(me)
    return ob,len(me.loop_triangles)
try:
    for f in families:
        for level,source in enumerate(f.pop('_objects')):
            ob,tris=export_copy(source,'DETAIL_'+f['id']+'_LOD'+str(level),role=f['role']);ob['detail_family']=f['id'];ob['lod_level']=level
            f['nodes'].append(ob.name);f['triangles'].append(tris)
    replacement_manifest=[]
    for source in replacements:
        ob,tris=export_copy(source,'DETAIL_STATIC_'+source.name,world=True,role='static')
        ob['replaces_source']=source.name;replacement_manifest.append({'node':ob.name,'source':source.name,'triangles':tris})
    bpy.ops.export_scene.gltf(filepath=str(OUT/'desert-detail-raw.glb'),export_format='GLB',use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_apply=True,export_vertex_color='NAME',export_vertex_color_name='Color',export_image_format='AUTO')
    report={'version':1,'sourceStage':27 if rock_families else 26 if 'Step26' in game.name else 25,'units':'meters','upAxis':'Y','geometryFile':'desert-detail-game.glb','families':families,'replacements':replacement_manifest,'hysteresis':.12,'instanceCount':sum(len(f['placements'])for f in families),'vegetationCount':sum(len(f['placements'])for f in families if f['role']=='vegetation'),'collisionPolicy':'Existing static GLB remains the collision source. Detail meshes are visual replacements.','trainPolicy':'Existing train GLB unchanged.'}
    (PUBLIC/'desert-detail-manifest.json').write_text(json.dumps(report,indent=2))
    (OUT/'export-report.json').write_text(json.dumps({'meshes':len(copies),'families':len(families),'instances':report['instanceCount'],'vegetation':report['vegetationCount'],'rawBytes':(OUT/'desert-detail-raw.glb').stat().st_size,'triangles':sum(len(m.loop_triangles)for m in meshes)},indent=2))
    print('Exported',len(copies),'meshes,',report['instanceCount'],'placements;',report['vegetationCount'],'plants')
finally:
    bpy.context.window.scene=game
    for ob in copies:bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.scenes.remove(export_scene)
    for me in meshes:
        if me.users==0:bpy.data.meshes.remove(me)
    if veg.users==0:bpy.data.materials.remove(veg)
