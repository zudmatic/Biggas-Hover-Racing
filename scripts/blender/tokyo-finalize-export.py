"""Run after prepare_export.py, through live Blender MCP."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(globals().get('TOKYO_EXPORT_DIR', Path(__file__).resolve().parent))
stage=bpy.data.scenes['Tokyo_Playtest_Export']
bpy.context.window.scene=stage
coll=bpy.data.collections['COL_Collision_Tokyo']
render=bpy.data.collections['COL_Render_Tokyo']
solid=bpy.data.objects['COL_SOLID_Tokyo']
if 'simplification_ratio' not in solid:
    original=solid.data
    mod=solid.modifiers.new('Simplificar colision de prueba','DECIMATE');mod.ratio=.4
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    me=bpy.data.meshes.new_from_object(solid.evaluated_get(dg),depsgraph=dg)
    bv=BVHTree.FromPolygons([v.co for v in me.vertices],[list(p.vertices) for p in me.polygons])
    error=max(bv.find_nearest(v.co)[3] for v in original.vertices)
    assert error<=.2, f'Collider simplification error {error}m: inspect before accepting'
    solid.modifiers.remove(mod);me.validate(clean_customdata=True);me.update();solid.data=me
    solid['simplification_max_error_m']=error;solid['simplification_ratio']=.4

def bvh():
    vv=[];ff=[]
    for o in coll.objects:
        if o.get('collision_role')!='floor':continue
        n=len(vv);vv.extend(v.co.copy() for v in o.data.vertices)
        ff.extend(tuple(n+i for i in p.vertices) for p in o.data.polygons)
    return BVHTree.FromPolygons(vv,ff)

def make(name,vv,ff):
    me=bpy.data.meshes.new(name);me.from_pydata(vv,[],ff);me.update()
    ob=bpy.data.objects.new(name,me);coll.objects.link(ob)
    ob['collision_role']='floor';ob.hide_render=True;ob.display_type='WIRE'
    return ob

# The drawbridge is closed for this driving test. A single plane bridges tiny
# mechanical seams; separate leaf animation/colliders are a later gameplay pass.
w=bpy.data.objects['TE_SOCKET_Drawbridge_W'].matrix_world.translation
e=bpy.data.objects['TE_SOCKET_Drawbridge_E'].matrix_world.translation
f=(e-w).normalized();side=Vector((-f.y,f.x,0))*16.2
make('COL_FLOOR_Closed_Bridge',[w-side,e-side,e+side,w+side],[(0,1,2,3)])
bv=bvh()
probes=json.loads((OUT/'surface-probes.json').read_text())
# The hover solver samples a point below the vehicle. Stitch only the 40 cm
# median gaps (the hull spans them), never the intentional alley jump gap.
for name in ['main','tunnel']:
    points=[Vector((p[0],-p[2],p[1])) for p in probes[name]]
    vv=[];ff=[]
    for i,p in enumerate(points):
        q=points[(i+1)%len(points)] if i+1<len(points) or name=='main' else points[i]+(points[i]-points[i-1])
        f=q-p;f.z=0;f.normalize();side=Vector((-f.y,f.x,0))
        heights=[]
        for offset in [-.7,.7]:
            hit=bv.ray_cast(p+side*offset+Vector((0,0,2.5)),Vector((0,0,-1)),5)[0]
            if hit is not None:heights.append(hit.z)
        assert heights, f'Missing median supports {name}:{i}'
        p.z=sum(heights)/len(heights)
        vv.extend([p-side*.45,p+side*.45])
    n=len(points)
    for i in range(n if name=='main' else n-1):
        a=2*i;b=2*((i+1)%n);ff.append((a,b,b+1,a+1))
    make('COL_FLOOR_Median_'+name,vv,ff)

bv=bvh()
def project(p):
    v=Vector((p[0],-p[2],p[1]))
    h=bv.ray_cast(v+Vector((0,0,2.5)),Vector((0,0,-1)),5)[0]
    assert h is not None, f'No drivable floor at {p}'
    return [p[0],round(h.z,5),p[2]]

report={}
for name,points in probes.items():
    errors=[abs(project(p)[1]-p[1]) for p in points]
    report[name]={'samples':len(points),'missing_floor':0,'max_curve_to_surface_m':max(errors)}
route=json.loads((OUT/'route_gltf.json').read_text())
for s in route['samples']:s['position']=project(s['position'])
for name in ['gameplay.json','test-spawns.json']:
    data=json.loads((OUT/name).read_text())
    if name=='gameplay.json':
        for p in data['checkpoints']+data['spawn_positions']:p['position_gltf']=project(p['position_gltf'])
    else:
        for p in data.values():p['position']=project(p['position'])
    (OUT/name).write_text(json.dumps(data,separators=(',',':')))
(OUT/'route_gltf.json').write_text(json.dumps(route,separators=(',',':')))
(OUT/'surface-validation-blender.json').write_text(json.dumps(report,indent=2))

def stats(collection):
    count=0
    for o in collection.objects:
        o.data.validate(clean_customdata=True);o.data.update();o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    return {'objects':len(collection.objects),'triangles':count}
validation=json.loads((OUT/'export-validation.json').read_text())
validation.update({'visual':stats(render),'collision':stats(coll),'solid_max_vertex_deviation_m':solid['simplification_max_error_m'],'surface_probes':report})
(OUT/'export-validation.json').write_text(json.dumps(validation,indent=2))

if not stage.camera:
    camera=bpy.data.objects['CAM_TE_General'].copy();camera.data=camera.data.copy();stage.collection.objects.link(camera);stage.camera=camera
stage.world=bpy.data.scenes['Tokyo_Editable'].world
stage.render.resolution_x=1400;stage.render.resolution_y=1000
bpy.data.libraries.write(str(OUT/'tokyo-circuit-export.blend'),{stage},fake_user=True,compress=True)

for collection,filename in [(render,'tokyo-highway.glb'),(coll,'tokyo-collision.glb')]:
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(collection.objects))
    # GLB is the exporter's current default; export only the selected static meshes.
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),use_selection=True,
       export_yup=True,export_animations=False,export_cameras=False,export_lights=False,
       export_extras=True,export_materials='EXPORT' if collection==render else 'NONE')
print(json.dumps(validation,indent=2))
