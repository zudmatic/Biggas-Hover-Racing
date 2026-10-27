"""Run in live Blender through MCP. Preserve Step 25; save a separate Step 26.

The height is an artistic approximation from albedo luminance, combined with
the existing procedural normal. It is not a scan or a high-poly sculpt bake.
"""
import bpy
from pathlib import Path

root=next(p for p in Path(bpy.data.filepath).parents if (p/'package.json').exists())
out=root/'assets/maps/desert-valley/normal-upgrade';out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
game=bpy.data.materials['MAT_S23_Sandstone_Game']
old_normal=next(n for n in game.node_tree.nodes if n.type=='NORMAL_MAP')
old_tex=old_normal.inputs['Color'].links[0].from_node
diffuse=next(n for n in game.node_tree.nodes if n.type=='TEX_IMAGE' and n!=old_tex).image
temp=bpy.data.scenes.new('TEMP_S26_NormalBake');bpy.context.window.scene=temp
mat=bpy.data.materials.new('TEMP_S26_HeightSource');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links
bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
color=nodes.new('ShaderNodeTexImage');color.image=diffuse
micro=nodes.new('ShaderNodeTexImage');micro.image=bpy.data.images['T_S23_Sandstone_Normal_v01']
normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.55
links.new(micro.outputs['Color'],normal.inputs['Color'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.8;bump.inputs['Distance'].default_value=1.4
links.new(color.outputs['Color'],bump.inputs['Height']);links.new(normal.outputs['Normal'],bump.inputs['Normal']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
image=bpy.data.images.new('T_S26_Sandstone_Normal_v02',width=2048,height=2048,alpha=False)
image.colorspace_settings.name='Non-Color'
target=nodes.new('ShaderNodeTexImage');target.image=image
nodes.active=target;target.select=True
mesh=bpy.data.meshes.new('TEMP_S26_BakePlane');mesh.from_pydata([(-24,-24,0),(24,-24,0),(24,24,0),(-24,24,0)],[],[(0,1,2,3)])
uv=mesh.uv_layers.new(name='UVMap')
for loop,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=co
ob=bpy.data.objects.new('TEMP_S26_BakePlane',mesh);temp.collection.objects.link(ob);mesh.materials.append(mat)
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
temp.render.engine='CYCLES';temp.cycles.device='CPU';temp.cycles.samples=1
temp.render.bake.use_selected_to_active=False;temp.render.bake.normal_space='TANGENT';temp.render.bake.margin=16
try:
    bpy.ops.object.bake(type='NORMAL')
    image.filepath_raw=str(out/'T_S26_Sandstone_Normal_v02.png');image.file_format='PNG';image.save();image.pack()
    old_tex.image=image;old_normal.inputs['Strength'].default_value=.9
    game['normal_note']='Step 26: albedo-derived height approximation + procedural microrelief, tangent OpenGL, 2048px.'
finally:
    bpy.context.window.scene=scene
    bpy.data.objects.remove(ob,do_unlink=True);bpy.data.scenes.remove(temp)
    bpy.data.meshes.remove(mesh);bpy.data.materials.remove(mat)
scene.name='Desert Circuit - Step26 - Rock Normals'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'desert-circuit-step26-rock-normals-v01.blend'))
print('Saved Step 26; Step 25 unchanged. Shared sandstone normal:',image.name,list(image.size),'strength',old_normal.inputs['Strength'].default_value)
