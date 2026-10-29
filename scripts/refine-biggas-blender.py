"""Refine the integrated Biggas GLBs with Blender 4.5+; stage, validate, then review.

blender --background --disable-autoexec --python scripts/refine-biggas-blender.py -- \
  --input-dir .context/blender-pass/input --output-dir .context/blender-pass/output

Uses arjun988/blender-skills' audit/refine/export/engine-validation workflow.
The original .blend, colliders, routes, placement and material names stay intact.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def triangles(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def tree(mesh):
    mesh.calc_loop_triangles()
    return BVHTree.FromPolygons([v.co for v in mesh.vertices],
                               [list(t.vertices) for t in mesh.loop_triangles], all_triangles=True)


def bake_canopy_depth(mesh):
    """Static self-occlusion, shared by every instance of the original template."""
    mesh.calc_loop_triangles()
    keys=[tuple(round(c, 5) for c in v.co) for v in mesh.vertices]
    normals={key:Vector((0, 0, 0)) for key in keys}
    for face in mesh.loop_triangles:
        a,b,c=[mesh.vertices[i].co for i in face.vertices]
        normal=(b-a).cross(c-a)
        for i in face.vertices:
            normals[keys[i]]+=normal
    for normal in normals.values():
        normal.normalize()
    bvh=tree(mesh)
    zmin=min(v.co.z for v in mesh.vertices)
    height=max(v.co.z for v in mesh.vertices)-zmin
    reach=max(.35, height*.32)
    epsilon=max(.001, height*.0002)
    directions=[]
    for i in range(48):
        z=1-2*(i+.5)/48
        angle=i*math.pi*(3-math.sqrt(5))
        radius=math.sqrt(1-z*z)
        directions.append(Vector((radius*math.cos(angle),radius*math.sin(angle),z)))
    values={}
    for vertex,key in zip(mesh.vertices,keys):
        if key in values:
            continue
        normal=normals[key]
        if normal.length_squared<.5:
            normal=Vector((0,0,1))
        origin=vertex.co+normal*epsilon
        blocked=weight=0
        for direction in directions:
            cosine=normal.dot(direction)
            if cosine<=.05:
                continue
            hit,_,_,distance=bvh.ray_cast(origin,direction,reach)
            weight+=cosine
            if hit is not None:
                blocked+=cosine*(1-distance/reach)
        lower=1-(vertex.co.z-zmin)/max(height,.001)
        values[key]=max(.74,1-.24*blocked/max(weight,.001)-.045*lower)
    color=mesh.color_attributes.new(name='Biggas_AO',type='FLOAT_COLOR',domain='POINT')
    for vertex,key in zip(mesh.vertices,keys):
        value=values[key]
        color.data[vertex.index].color=(value,value,value,1)
    mesh.color_attributes.active_color=color
    mesh.color_attributes.render_color_index=len(mesh.color_attributes)-1
    return {'mesh':mesh.name,'min':min(values.values()),'max':max(values.values()),'samples':len(values)}


def simplify_monument(obj):
    """Only dense, smooth body forms; lettering, eyes and ornament are untouched."""
    source=obj.data.copy()
    before=triangles(source)
    original_name=obj.data.name
    scale=max(abs(v) for v in obj.matrix_world.to_scale())
    accepted=None
    # Prefer a substantial reduction, but reject a candidate above 3.5cm error.
    for ratio in [.18,.28,.42,.6]:
        candidate=source.copy()
        obj.data=candidate
        modifier=obj.modifiers.new('Biggas silhouette budget','DECIMATE')
        modifier.ratio=ratio
        modifier.use_collapse_triangulate=True
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        result=obj.data
        surface=tree(result)
        distances=[]
        # Check every original vertex, not just the decimated vertices.
        for vertex in source.vertices:
            distances.append(surface.find_nearest(vertex.co)[3]*scale)
        original_surface=tree(source)
        for vertex in result.vertices:
            distances.append(original_surface.find_nearest(vertex.co)[3]*scale)
        error=max(distances)
        if error<=.035:
            accepted={'object':obj.name,'before':before,'after':triangles(result),'ratio':ratio,'maxSurfaceErrorMetres':error}
            break
        obj.data=source
        bpy.data.meshes.remove(result)
    if accepted is None:
        obj.data=source
        accepted={'object':obj.name,'before':before,'after':before,'ratio':1,'maxSurfaceErrorMetres':0}
    # The mesh's public name is part of the existing game's import contract.
    orphan=bpy.data.meshes.get(original_name)
    if orphan and orphan!=obj.data and orphan.users==0:
        bpy.data.meshes.remove(orphan)
    obj.data.name=original_name
    if source!=obj.data:
        bpy.data.meshes.remove(source)
    return accepted


def snapshot():
    return {o.name:{'type':o.type,'matrix':list(v for row in o.matrix_world for v in row),
                    'materials':[m.name for m in o.data.materials if m] if o.type=='MESH' else []}
            for o in bpy.data.objects}


def run(input_dir,output_dir):
    assert input_dir.resolve()!=output_dir.resolve(), 'Use a staging directory, not the input directory.'
    output_dir.mkdir(parents=True,exist_ok=True)
    report={'blender':bpy.app.version_string,'skills':'https://github.com/arjun988/blender-skills',
            'units':'metres','exportAxis':'+Y up','texturesAdded':0,'lightsAdded':0,'parts':{}}
    for part in ['Forest_LOD1','Landmark']:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        filename=f'Biggas_City_039_v02_{part}.glb'
        source=input_dir/filename
        bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
        bpy.context.view_layer.update()
        before=snapshot()
        objects=[o for o in bpy.data.objects if o.type=='MESH']
        weighted_before=sum(triangles(o.data) for o in objects)
        geometry_before={m:([tuple(v.co) for v in m.vertices],triangles(m)) for m in bpy.data.meshes} if part=='Forest_LOD1' else {}
        changes=[]
        if part=='Forest_LOD1':
            for mesh in bpy.data.meshes:
                if any(token in mesh.name for token in ['Pine','Cedar','Oak','Beech','Birch','Maple','Shrub']):
                    changes.append(bake_canopy_depth(mesh))
            for mesh,(vertices,count) in geometry_before.items():
                assert vertices==[tuple(v.co) for v in mesh.vertices]
                assert count==triangles(mesh)
        else:
            for obj in objects:
                if triangles(obj.data)>10000 and all(m.name=='CAT_Warm ivory cast bronze' for m in obj.data.materials):
                    changes.append(simplify_monument(obj))
        weighted_after=sum(triangles(o.data) for o in objects)
        assert snapshot()==before, 'Object placement/material contract changed.'
        assert weighted_after<=weighted_before, 'Triangle budget increased.'
        export_collection=bpy.data.collections.new('COL_Export')
        bpy.context.scene.collection.children.link(export_collection)
        for obj in list(bpy.data.objects):
            for collection in list(obj.users_collection):
                collection.objects.unlink(obj)
            export_collection.objects.link(obj)
        # Retain linked meshes and each instance's transform: flattening them
        # would duplicate thousands of trees. glTF natively carries this data.
        bpy.ops.wm.save_as_mainfile(filepath=str((output_dir/f'{part}_refined.blend').resolve()),compress=True)
        bpy.ops.export_scene.gltf(filepath=str((output_dir/filename).resolve()),export_format='GLB',
                                  export_yup=True,export_lights=True,export_cameras=False,
                                  export_animations=False,export_apply=False,export_extras=False,
                                  export_vertex_color='ACTIVE',export_all_vertex_colors=False)
        report['parts'][part]={'objects':len(before),'trianglesBefore':weighted_before,'trianglesAfter':weighted_after,
                               'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                               'outputSha256':hashlib.sha256((output_dir/filename).read_bytes()).hexdigest(),
                               'bytesBefore':source.stat().st_size,'bytesAfter':(output_dir/filename).stat().st_size,
                               'changes':changes}
        print('REFINED',part,weighted_before,weighted_after,flush=True)
    (output_dir/'blender-refinement-report.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--input-dir',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    run(args.input_dir,args.output_dir)
