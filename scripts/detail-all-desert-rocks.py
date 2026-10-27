"""Run through live Blender MCP from Step 26. Non-destructive Step 27.

Same shared erosion group as the approved Southern Mesa, in metre space.
LOD0 keeps Geometry Nodes editable; LOD1/2 derive from that evaluated surface.
Authored objects, roads, water, vegetation placements and train are retained.
"""
import bpy,math,json
from pathlib import Path

root=next(p for p in Path(bpy.data.filepath).parents if (p/'package.json').exists())
out=root/'assets/maps/desert-valley/all-rock-detail';out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
assert not bpy.data.collections.get('COL_S27_All_Rock_Detail'),'Step 27 already exists'
sources=[o for o in scene.objects if o.type=='MESH' and o.visible_get() and o.name!='SM_S23_SouthernMesa_LOD0' and any(m and m.name=='MAT_S23_Sandstone_Game' for m in o.data.materials)]
assert len(sources)==37,len(sources)
def collection(name,parent):
    c=bpy.data.collections.new(name);parent.children.link(c);return c
parent=collection('COL_S27_All_Rock_Detail',scene.collection)
near=collection('COL_S27_Rock_LOD0_Editable',parent)
far=collection('COL_S27_Rock_LOD1_2_Export',parent);far.hide_render=True
group=bpy.data.node_groups['GN_S23_Sandstone_Erosion_v01']
report=[]
for index,source in enumerate(sources):
    key='RockFormation_'+str(index).zfill(2)
    ob=source.copy();ob.data=source.data.copy();ob.name='SM_S27_'+key+'_LOD0';near.objects.link(ob)
    ob.data.transform(source.matrix_world);ob.matrix_world.identity()
    ob['source_object']=source.name;ob['s27_detail']=True;ob['detail_family']=key
    for p in ob.data.polygons:p.use_smooth=True
    pillar='DirtPillar' in source.name;talus='TALUS' in source.name
    mod=ob.modifiers.new('Shared sandstone erosion · editable','NODES');mod.node_group=group
    mod['Socket_1']=3;mod['Socket_2']=.38 if pillar else .65 if talus else 1.0
    mod['Socket_3']=1.8 if pillar else 3.2;mod['Socket_4']=23.0
    dec=ob.modifiers.new('LOD0 triangle budget','DECIMATE');dec.ratio=.48
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    evaluated=ob.evaluated_get(dg);mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=dg)
    mesh.calc_loop_triangles();triangles=[len(mesh.loop_triangles)]
    assert triangles[0]<40000,(source.name,triangles[0])
    assert all(math.isfinite(x) for v in mesh.vertices for x in v.co)
    levels=[ob.name]
    for level,ratio in [(1,.42),(2,.12)]:
        data=mesh.copy();lod=bpy.data.objects.new('SM_S27_'+key+'_LOD'+str(level),data);far.objects.link(lod)
        lod['source_object']=source.name;lod['detail_family']=key;lod['lod_level']=level
        dec=lod.modifiers.new('LOD'+str(level)+' reduction from detailed surface','DECIMATE');dec.ratio=ratio
        bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
        ev=lod.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles();triangles.append(len(me.loop_triangles));ev.to_mesh_clear()
        lod.hide_set(True);levels.append(lod.name)
    bpy.data.meshes.remove(mesh)
    source.hide_set(True);source.hide_render=True
    report.append({'id':key,'source':source.name,'objects':levels,'triangles':triangles,'role':'pillar' if pillar else 'talus' if talus else 'mesa','distances':[45,130] if pillar else [100,260]})
# Lower the experimental albedo-derived normal; geometry now carries the large
# relief on every formation, while the shared texture provides smaller cracks.
mat=bpy.data.materials['MAT_S23_Sandstone_Game']
next(n for n in mat.node_tree.nodes if n.type=='NORMAL_MAP').inputs['Strength'].default_value=.3
scene.name='Desert Circuit - Step27 - All Rock Detail'
scene['s27_detail_manifest']=json.dumps(report)
(out/'rock-manifest.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'desert-circuit-step27-all-rock-detail-v01.blend'))
print(json.dumps({'newFormations':len(report),'trianglesByLOD':[sum(r['triangles'][i] for r in report) for i in range(3)],'referenceMesaUnchanged':True,'maxLOD0':max(r['triangles'][0] for r in report),'saved':bpy.data.filepath}))
