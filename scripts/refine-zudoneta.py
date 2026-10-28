"""Refine the supplied v06 Blender source into Zudoneta v07.

Blender 4.3+: blender -b --python scripts/refine-zudoneta.py -- source.blend output-directory
The output includes an editable packed .blend, a self-contained GLB and topology QA.
Construction coordinates below use the game's convention: X right, Y up, Z forward.
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, output = Path(args[0]).resolve(), Path(args[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
root = bpy.data.objects['037_NAVE_OLIVA_CONTROL']
root.name = '037_ZUDONETA_CONTROL'
root['revision'] = 'v07 · integrated assemblies'
assembly = bpy.data.collections.new('037 · Uniones v07')
bpy.context.scene.collection.children.link(assembly)
mat = {key: bpy.data.materials[name] for key, name in {
 'olive': '02 Verde oliva militar', 'ivory': '01 Marfil cálido · pintura',
 'graphite': 'v05 · mat_00 · cast · 04 Grafito mecanismos',
 'metal': 'v05 · mat_04 · brushed · 05 Metal envejecido',
 'rubber': 'v05 · mat_21 · rubber · 06 Goma carbón',
}.items()}

# Small machined fittings use quiet, untextured finishes. Reusing the source's
# baked normal maps on newly projected UVs creates oversized scratches.
for key,color,metallic,roughness in (
 ('graphite',(.035,.043,.039,1),.55,.65),
 ('metal',(.17,.19,.17,1),.8,.48),
 ('rubber',(.014,.018,.016,1),0,.88)):
 material=bpy.data.materials.new('v07 · '+key);material.use_nodes=True
 shader=material.node_tree.nodes.get('Principled BSDF')
 shader.inputs['Base Color'].default_value=color
 shader.inputs['Metallic'].default_value=metallic
 shader.inputs['Roughness'].default_value=roughness
 mat[key]=material

# Work with the existing UVs/materials on authored surfaces; only new parts need UVs.
def V(p): return Vector((p[0], -p[2], p[1]))
def game(p): return Vector((p.x, p.z, -p.y))
def active(obj):
 bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active = obj

def apply(obj):
 active(obj)
 for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def uv_project(obj):
 uv = obj.data.uv_layers.new(name='UVMap')
 for poly in obj.data.polygons:
  axis = max(range(3), key=lambda i: abs(poly.normal[i]))
  axes = [i for i in range(3) if i != axis]
  for li in poly.loop_indices:
   co = obj.data.vertices[obj.data.loops[li].vertex_index].co
   uv.data[li].uv = (co[axes[0]] * .5, co[axes[1]] * .5)

def mesh(name, vertices, faces, material, bevel=0):
 data = bpy.data.meshes.new(name);data.from_pydata([V(v) for v in vertices], [], faces);data.update()
 bm = bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces));bm.to_mesh(data);bm.free()
 obj = bpy.data.objects.new(name, data);assembly.objects.link(obj);obj.parent = root;data.materials.append(material);uv_project(obj)
 if bevel: finish(obj, bevel)
 return obj

def finish(obj, width=.008):
 m = obj.modifiers.new('Radios de ensamblaje', 'BEVEL');m.width = width;m.segments = 2;m.limit_method = 'ANGLE';m.angle_limit = .6
 m = obj.modifiers.new('Normales de chapa', 'WEIGHTED_NORMAL');m.keep_sharp = True;m.weight = 50

faces_box = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def box(name, center, size, material, bevel=.008):
 x,y,z = center;a,b,c = [s/2 for s in size]
 return mesh(name, [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y-b,z+c),(x-a,y-b,z+c),
                    (x-a,y+b,z-c),(x+a,y+b,z-c),(x+a,y+b,z+c),(x-a,y+b,z+c)], faces_box, material, bevel)

def tube(name, center, axis, profiles, material, sides=12):
 # profiles are (distance along axis, outside radius, inside radius); closed annulus.
 axis = Vector(axis).normalized();u = axis.cross(Vector((1,0,0)) if abs(axis.x)<.9 else Vector((0,1,0))).normalized();v = axis.cross(u)
 center = Vector(center);verts=[]
 for distance, outer, inner in profiles:
  for radius in (outer, inner):
   verts += [center+axis*distance+(u*math.cos(2*math.pi*i/sides+math.pi/sides)+v*math.sin(2*math.pi*i/sides+math.pi/sides))*radius for i in range(sides)]
 faces=[];stride=sides*2
 for k in range(len(profiles)-1):
  for i in range(sides):
   j=(i+1)%sides;a=k*stride;b=(k+1)*stride
   faces += [(a+i,a+j,b+j,b+i),(a+sides+j,a+sides+i,b+sides+i,b+sides+j)]
 for k in (0,len(profiles)-1):
  a=k*stride
  for i in range(sides):j=(i+1)%sides;faces.append((a+i,a+sides+i,a+sides+j,a+j))
 return mesh(name, verts, faces, material, .004)

def pin(name, center, axis, radius, depth, material, sides=12):
 a=Vector(axis).normalized();u=a.cross(Vector((1,0,0)) if abs(a.x)<.9 else Vector((0,1,0))).normalized();v=a.cross(u);c=Vector(center)
 verts=[c+a*d+(u*math.cos(2*math.pi*i/sides)+v*math.sin(2*math.pi*i/sides))*radius for d in (-depth/2,depth/2) for i in range(sides)]
 faces=[tuple(range(sides-1,-1,-1)),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
 return mesh(name,verts,faces,material,.002)

def bolt(name, point, axis=(0,1,0), size=.025):
 p=Vector(point);a=Vector(axis).normalized()
 pin(name+' · arandela',p,a,size*1.45,.009,mat['metal'])
 pin(name+' · cabeza',p+a*.012,a,size,.019,mat['graphite'],6)
 # A dark hex socket, recessed within the head rather than a bright decorative dot.
 pin(name+' · alojamiento',p+a*.022,a,size*.42,.002,mat['rubber'],6)

unions=[]
def union(target, other):
 apply(target);apply(other);active(target)
 # Blender's boolean material transfer uses the operand's slots.
 mod=target.modifiers.new('Fusión estructural', 'BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.object=other
 mod.material_mode='TRANSFER';bpy.ops.object.modifier_apply(modifier=mod.name)

 if not target.data.polygons:raise RuntimeError(f'Empty union: {target.name} + {other.name}')
 unions.append((target.name,other.name));bpy.data.objects.remove(other,do_unlink=True)

def top_height(obj, x, z):
 bpy.context.view_layer.update();inv=obj.matrix_world.inverted();origin=V((x,5,z));direction=V((0,-1,0))
 hit,loc,normal,index=obj.ray_cast(inv@origin,inv.to_3x3()@direction)
 if not hit: raise RuntimeError(f'No supporting surface below {obj.name}: {x}, {z}')
 return (obj.matrix_world@loc).z

# 1. The four intersecting solids of each pod become one continuous, closed shell.
pods=[]
for suffix in ('','.001'):
 pod=bpy.data.objects['Pod lateral chasis'+suffix]
 for name in ('Armadura marfil delantera','Armadura marfil trasera','Lomo mecánico del pod'):
  union(pod,bpy.data.objects[name+suffix])
 pod.name='Casco integrado pod '+('izquierdo' if suffix=='' else 'derecho');pods.append(pod)

# The upper nose plate had an unsupported lip. Extend its underside into the fairing
# before union, retaining the authored top surface, paint UVs, hatch and windshield.
nose=bpy.data.objects['Carenado central proa'];plate=bpy.data.objects['Placa superior inclinada del morro']
for i,vert in enumerate(plate.data.vertices):
 if i%8 in (0,1,2,7):vert.co.z-=.12
union(nose,plate);nose.name='Carenado central proa continuo';finish(nose)

# 2. Matching slanted panel edges replace the former coplanar overlap.
for suffix,sign,pod in zip(('','.001'),(-1,1),pods):
 panel=bpy.data.objects['Panel lateral oliva proa'+suffix]
 inv=panel.matrix_world.inverted()
 for vert in panel.data.vertices:
  p=game(panel.matrix_world@vert.co)
  if p.z<1.1:
   p.z=.85+(p.y-.72)*(.15/.68)+.028
   vert.co=inv@V(p)
 # Recessed gasket visible through the 28 mm seam; its rear side seats on a rail.
 low,high=.745,1.405
 z0=.85+(low-.72)*(.15/.68);z1=.85+(high-.72)*(.15/.68)
 verts=[(sign*x,y,z+d) for x in (1.74,1.795) for y,z in ((low,z0),(high,z1)) for d in (-.012,.04)]
 mesh('Junta panel lateral '+str(sign),verts,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],mat['rubber'],.003)
 # Solid mounting rails reach from the pod skin to the back of the service panels.
 for y,z,length in ((1.14,-.05,1.85),(.92,.40,.90)):
  rail=box('Bancada panel lateral '+str(sign),(sign*1.64,y,z),(.29,.075,length),mat['graphite'])
  union(pod,rail)
 # Gaskets around the removable panel perimeter are narrow, seated on its rear face.
 for panel_name in ('Panel lateral marfil','Panel lateral oliva proa'):
  plate=bpy.data.objects[panel_name+suffix]
  raw=[game(plate.matrix_world@v.co) for v in plate.data.vertices]
  inner=min(abs(v.x) for v in raw);outline=[v for v in raw if abs(abs(v.x)-inner)<1e-4]
  cy=sum(v.y for v in outline)/len(outline);cz=sum(v.z for v in outline)/len(outline)
  verts=[]
  for x in (inner-.018,inner+.004):
   verts += [(sign*x,cy+(p.y-cy)*1.035,cz+(p.z-cz)*1.015) for p in outline]
  n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  mesh('Junta perimetral '+panel_name+suffix,verts,faces,mat['rubber'],.003)

# 3. Join the two intersecting wing struts and give their root, splice and saddle
# actual load-bearing surfaces and fasteners. Everything remains part of the wing.
for suffix,sign in (('',-1),('.001',1)):
 lower=bpy.data.objects['Montante alerón inferior'+suffix];upper=bpy.data.objects['Montante alerón superior'+suffix]
 # The upper ends must seat beneath the wing, not pierce its top skin.
 inverse=upper.matrix_world.inverted()
 for vertex in upper.data.vertices:
  point=game(upper.matrix_world@vertex.co)
  if point.y>2.7:point.y=2.775;vertex.co=inverse@V(point)
 union(lower,upper);lower.name='Montante alerón continuo '+str(sign);finish(lower,.006)
 bpy.data.objects.remove(bpy.data.objects['Abrazadera montante'+suffix],do_unlink=True)
 # Tapered root follows the inclined strut and overlaps the central reactor skin.
 axis=Vector((sign*.09,.50,-.36)).normalized()
 boot=tube('Montante alerón zócalo '+str(sign),(sign*.66,1.80,-1.31),axis,[(-.10,.205,.095),(-.065,.205,.095),(.12,.145,.095)],mat['graphite'],8)
 union(lower,boot)
 for x in (sign*.49,sign*.81):
  # Triangular gussets bridge the root to the reactor deck.
  coords=[(x-.025,1.73,-1.08),(x-.025,1.73,-1.57),(x-.025,2.03,-1.49),(x+.025,1.73,-1.08),(x+.025,1.73,-1.57),(x+.025,2.03,-1.49)]
  gusset=mesh('Cartela montante alerón '+str(sign),coords,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],mat['graphite'],.009)
  # The side plates are fastened to the root; don't boolean disconnected hardware.
  bolt('Perno cartela alerón',(x+sign*.03,1.84,-1.39),(sign,0,0),.033)
 tube('Abrazadera alerón empalme '+str(sign),(sign*.72,2.14,-1.56),axis,[(-.045,.158,.102),(.045,.158,.102)],mat['metal'],8)
 bolt('Perno empalme alerón',(sign*.89,2.14,-1.56),(sign,0,0),.033)
 saddle=box('Alerón silla de apoyo '+str(sign),(sign*.84,2.775,-1.89),(.33,.085,.46),mat['graphite'],.016)
 union(lower,saddle)
 for z in (-2.045,-1.735):bolt('Perno silla alerón',(sign*.84,2.899,z),(0,1,0),.029)

# 4. Mechanical bell collars bridge the engine/intake housings to their parent shells.
# They are open annuli: rotors, airflow and gameplay exhaust outlets stay unobstructed.
for suffix,sign in (('',-1),('.001',1)):
 rear=tube('Tobera manguito de transición '+str(sign),(sign*1.24,.86,-2.30),(0,0,-1),[(-.06,.51,.34),(.025,.49,.34),(.085,.45,.34)],mat['graphite'],8)
 union(bpy.data.objects['Tobera lateral carcasa'+suffix],rear)
 tube('Tobera junta de montaje '+str(sign),(sign*1.24,.86,-2.345),(0,0,-1),[(-.016,.501,.455),(.016,.501,.455)],mat['metal'],8)
 # The front opening is vertically stretched, so stretch the collar before joining.
 front=tube('Toma frontal manguito '+str(sign),(0,0,0),(0,0,1),[(-.08,.46,.32),(.015,.455,.32),(.075,.425,.32)],mat['graphite'],8)
 for vert in front.data.vertices:
  p=game(vert.co);p.y*=1.36;p+=Vector((sign*1.24,.79,2.34));vert.co=V(p)
 union(bpy.data.objects['Toma frontal carcasa'+suffix],front)

# 5. Align the service boxes to the local armour slope, on compact conformal
# plinths. A level plinth on this canted shell would create an oversized wedge.
for suffix,sign,pod in zip(('','.001'),(-1,1),pods):
 service=bpy.data.objects['Caja de servicio posterior'+suffix]
 x,z=sign*1.24,-2.12;h=top_height(pod,x,z);delta=.03
 slope_x=(top_height(pod,x+delta,z)-top_height(pod,x-delta,z))/(2*delta)
 slope_z=(top_height(pod,x,z+delta)-top_height(pod,x,z-delta))/(2*delta)
 normal=Vector((-slope_x,1,-slope_z)).normalized()
 rotation=Vector((0,0,1)).rotation_difference(V(normal))
 ex=game(rotation@Vector((1,0,0)));ez=game(rotation@Vector((0,-1,0)))
 center=Vector((x,h,z));corners=[center+ex*dx+ez*dz for dx,dz in ((-.22,-.14),(.22,-.14),(.22,.14),(-.22,.14))]
 bottoms=[(p.x,top_height(pod,p.x,p.z)-.065,p.z) for p in corners]
 lift=max(.025,max((bottom[1]+.065-p.y)/normal.y for p,bottom in zip(corners,bottoms))+.025)
 top=[p+normal*lift for p in corners]
 base=mesh('Bancada caja servicio '+str(sign),bottoms+top,faces_box,mat['graphite'],.006)
 union(pod,base)
 service.rotation_mode='QUATERNION';service.rotation_quaternion=rotation
 service.location=V(center+normal*(lift+.012+.12))
 gasket=box('Junta caja servicio '+str(sign),(0,0,0),(.415,.018,.265),mat['rubber'],.004)
 for vertex in gasket.data.vertices:vertex.co=rotation@vertex.co+V(center+normal*(lift+.006))
 for dx in (-.15,.15):bolt('Perno caja servicio',center+ex*dx+normal*(lift+.012+.24),normal,.021)
 finish(pod,.006)

# Collect deterministic QA before writing: closed unified volumes, no lost UVs,
# all original images still packed and the original rotor and yoke pivots preserved.
qa={'source':source.name,'revision':'v07','unions':unions,'assemblies':[]}
for obj in pods+[nose]+[o for o in root.children_recursive if o.name.startswith('Montante alerón continuo')]:
 apply(obj);active(obj);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data)
 nonmanifold=sum(not e.is_manifold for e in bm.edges)
 unseen=set(bm.verts);components=0
 while unseen:
  components+=1;stack=[unseen.pop()]
  while stack:
   for edge in stack.pop().link_edges:
    for vertex in edge.verts:
     if vertex in unseen:unseen.remove(vertex);stack.append(vertex)
 qa['assemblies'].append({'name':obj.name,'nonmanifold_edges':nonmanifold,'components':components,'faces':len(bm.faces)})
 bm.free()
 if nonmanifold or components!=1:raise RuntimeError(f'Invalid unified assembly: {qa["assemblies"][-1]}')

bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+list(root.children_recursive):
 obj.hide_set(False);obj.select_set(True)
 # GLTFLoader names children of multi-material meshes after the mesh datablock.
 # Semantic names keep every primitive in the correct hangar inspection group.
 if obj.type=='MESH' and len(obj.data.materials)>1:obj.data.name=obj.name
# New parts and retained original parts all export, while studio lights/floor do not.
bpy.context.view_layer.objects.active=root
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(output/'zudoneta-037-v07.blend'))
bpy.ops.export_scene.gltf(filepath=str(output/'zudoneta-037-v07.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_extras=True,export_yup=True)
qa['mesh_objects']=sum(o.type=='MESH' for o in root.children_recursive)
qa['images']=len([i for i in bpy.data.images if i.packed_file])
(output/'zudoneta-037-v07-qa.json').write_text(json.dumps(qa,indent=2,ensure_ascii=False))
print('ZUDONETA_QA',json.dumps(qa,ensure_ascii=False))
