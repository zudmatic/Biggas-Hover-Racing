"""Run through Blender MCP in the live Tokyo_Editable scene. No authoring modifiers applied."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import interpolate_bezier

OUT = Path(globals().get('TOKYO_EXPORT_DIR', Path(__file__).resolve().parent))
source = bpy.data.scenes['Tokyo_Editable']
bpy.context.window.scene = source
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
assert 'Tokyo_Playtest_Export' not in bpy.data.scenes, 'Existing export stage: inspect before replacing.'
dg = bpy.context.evaluated_depsgraph_get()
stage = bpy.data.scenes.new('Tokyo_Playtest_Export')
render = bpy.data.collections.new('COL_Render_Tokyo')
collision = bpy.data.collections.new('COL_Collision_Tokyo')
stage.collection.children.link(render)
stage.collection.children.link(collision)
floor_parts, solid_parts = [], []

def make(name, vertices, faces, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata(vertices, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob

def mesh_part(me, matrix, polygons):
    used = sorted({v for p in polygons for v in p.vertices})
    ids = {v:i for i,v in enumerate(used)}
    return ([tuple(matrix @ me.vertices[v].co) for v in used],
            [tuple(ids[v] for v in p.vertices) for p in polygons])

def add_part(target, me, matrix, polygons):
    if polygons: target.append(mesh_part(me, matrix, polygons))

# Instanced structural supports are simple convex pieces already. Omit the
# many small guardrail posts, terminals and luminous lenses from collision.
for inst in dg.object_instances:
    if inst.is_instance and any(x in inst.object.data.name for x in ('Columna','Zapata','Cabezal_T')):
        add_part(solid_parts, inst.object.data, inst.matrix_world, list(inst.object.data.polygons))

visible = [o for o in source.objects if o.type == 'MESH' and not o.hide_render]
for ob in visible:
    ev = ob.evaluated_get(dg)
    core = ev.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
    name = ob.name
    highway = name in ('HW_TE_Principal','HW_TE_Tunel')
    bridge_deck = 'Drawbridge_Approach_' in name or 'Drawbridge_Leaf_' in name
    alley = name in ('SM_TE02_Calzada_Callejon','SM_TE02_Rampa_Entrada','SM_TE02_Base_Calle_Baja')
    ground = name == 'SM_TE_Area_875m'
    blocker = any(x in name for x in ('SM_TE02_Bloque_','SM_TE02_Recepcion_','SM_TE02_Apoyo_','Drawbridge_Piers','Drawbridge_Towers','Drawbridge_Hinges'))
    if highway or bridge_deck or alley or ground or blocker:
        floor, solid = [], []
        atlas = core.uv_layers.get('UV_HW_Atlas')
        for p in core.polygons:
            up = (ob.matrix_world.to_3x3() @ p.normal).z > .75
            mat = core.materials[p.material_index].name if core.materials else ''
            asphalt = atlas and 'Shared_Grit' in mat and all(atlas.data[i].uv.x < .70 for i in p.loop_indices)
            bridge_top = bridge_deck and all(abs((ob.matrix_world @ core.vertices[i].co).z - 22) < .015 for i in p.vertices)
            is_floor = up and (ground or alley or asphalt or bridge_top)
            (floor if is_floor else solid).append(p)
        add_part(floor_parts, core, ob.matrix_world, floor)
        if not ground: add_part(solid_parts, core, ob.matrix_world, solid)
    ev.to_mesh_clear()
    mods = [(m, m.get('Socket_29')) for m in ob.modifiers if m.type == 'NODES' and 'Socket_29' in m]
    try:
        for m,_ in mods: m['Socket_29'] = True
        ob.update_tag(); bpy.context.view_layer.update()
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(ob.matrix_world)
        me.update()
        copy = bpy.data.objects.new('VIS_' + name, me)
        copy['source_object'] = name
        render.objects.link(copy)
    finally:
        for m,value in mods: m['Socket_29'] = value
        ob.update_tag(); bpy.context.view_layer.update()

def combine(name, parts, role):
    vertices, faces = [], []
    for vv,ff in parts:
        start = len(vertices)
        vertices.extend(vv)
        faces.extend(tuple(start+i for i in f) for f in ff)
    obj = make(name, vertices, faces, collision)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
    # Preserve curved boundaries and height changes; dissolve only coplanar
    # subdivisions and atlas seams. Do not decimate the driving silhouette.
    bmesh.ops.dissolve_limit(bm, angle_limit=.0001, use_dissolve_boundaries=False,
                             verts=list(bm.verts), edges=list(bm.edges))
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    obj['collision_role'] = role
    obj.display_type = 'WIRE'
    obj.hide_render = True
    return obj

floors = combine('COL_FLOOR_Tokyo', floor_parts, 'floor')
solids = combine('COL_SOLID_Tokyo', solid_parts, 'solid')

def dense_curve(name):
    ob = bpy.data.objects[name]; points = ob.data.splines[0].bezier_points
    result = []
    for a,b in zip(points, list(points)[1:]):
        result.extend(ob.matrix_world @ v for v in interpolate_bezier(a.co,a.handle_right,b.handle_left,b.co,65)[:-1])
    result.append(ob.matrix_world @ points[-1].co)
    return result

def resample(points, step=3.0, closed=False):
    points = points + [points[0]] if closed else points
    lengths = [0.0]
    for a,b in zip(points,points[1:]): lengths.append(lengths[-1]+(b-a).length)
    n = max(2,math.ceil(lengths[-1]/step))
    targets = [i*lengths[-1]/n for i in range(n if closed else n+1)]
    result=[]; j=0
    for d in targets:
        while j+1<len(lengths)-1 and lengths[j+1]<d: j+=1
        result.append(points[j].lerp(points[j+1],(d-lengths[j])/max(1e-9,lengths[j+1]-lengths[j])))
    return result, lengths[-1]

def game(v): return [round(v.x,5),round(v.z,5),round(-v.y,5)]
def write(name,data): (OUT/name).write_text(json.dumps(data,separators=(',',':')))
main = dense_curve('CTRL_TE_Principal')
start = bpy.data.objects['CTRL_TE_Principal'].data.splines[0].bezier_points[52].co
i = min(range(len(main)),key=lambda i:(main[i]-start).length)
# The unmodelled curve gap is precisely the closed 300 m drawbridge.
main = main[i:] + main[:i]
route, length = resample(main,closed=True)
samples=[]
for i,p in enumerate(route):
    samples.append({'distance_m':i*length/len(route),'position':game(p),'forward':game((route[(i+1)%len(route)]-p).normalized()),'width_m':32.4})
tunnel,_=resample(dense_curve('CTRL_TE_Tunel_Alternativo'))
entry,_=resample(dense_curve('CTRL_TE_Callejon_Entrada'))
alley,_=resample(dense_curve('CTRL_TE_Callejon_Rampa'))
write('route_gltf.json',{'length_m':length,'samples':samples,'shortcuts':[[game(v) for v in tunnel],[game(v) for v in entry+alley]],'shortcut':[game(v) for v in tunnel]})
control=bpy.data.objects['CTRL_TE_Principal'].data.splines[0].bezier_points
gates=[]
for order,k in enumerate([52,9,25,32,50]):
    index=min(range(len(route)),key=lambda i:(route[i]-control[k].co).length)
    gates.append({'order':order,'route_index':index,'position_gltf':samples[index]['position'],'forward_gltf':samples[index]['forward'],'width_m':36,'height_m':8})
write('gameplay.json',{'name':'Tokyo elevated circuit — playtest','lap_length_m':length,'road_width_m':32.4,'start_route_distance_m':0,'spawn_positions':[{'route_index':0,'position_gltf':samples[0]['position'],'forward_gltf':samples[0]['forward']}],'checkpoints':gates})
test={}
for name,points,k in [('start',route,0),('bridge',route,min(range(len(route)),key=lambda i:(route[i]-control[58].co).length)),('spiral',route,min(range(len(route)),key=lambda i:(route[i]-control[37].co).length)),('tunnel',tunnel,len(tunnel)//2),('alley',alley,8),('jump',entry,0)]:
    test[name]={'position':game(points[k]),'forward':game((points[k+1]-points[k]).normalized())}
write('test-spawns.json',test)
write('surface-probes.json',{'main':[game(v) for v in route],'tunnel':[game(v) for v in tunnel],'entry':[game(v) for v in entry],'alley':[game(v) for v in alley]})

def stats(collection):
    total=0
    for o in collection.objects:
        o.data.calc_loop_triangles(); total+=len(o.data.loop_triangles)
        assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
        assert len(o.modifiers)==0 and all(abs(v-1)<1e-7 for v in o.scale)
    return {'objects':len(collection.objects),'triangles':total}
report={'visual':stats(render),'collision':stats(collision),'route_length_m':length,
        'bridge_length_m':(bpy.data.objects['TE_SOCKET_Drawbridge_W'].matrix_world.translation-bpy.data.objects['TE_SOCKET_Drawbridge_E'].matrix_world.translation).length,
        'scenes_in_master':[s.name for s in bpy.data.scenes if s != stage],
        'authoring_modifiers_intact':all(bpy.data.objects[n].modifiers[0].type=='NODES' for n in ['HW_TE_Principal','HW_TE_Tunel','SM_TE02_Calzada_Callejon','SM_TE02_Rampa_Entrada'])}
write('export-validation.json',report)
print(json.dumps(report,indent=2))
