export const inkShadingGLSL = `
vec3 shadeFlatPrintInk(vec3 baseColor, vec3 point){
 vec3 cell=floor(point*220.);
 float grain=fract(sin(dot(cell,vec3(12.9898,78.233,43.156)))*43758.5453);
 float fleck=smoothstep(.89,.97,grain);
 return mix(baseColor,baseColor*.35,fleck*.55);
}
vec3 shadePrintInk(vec3 baseColor, vec3 point, vec3 surfaceNormal){
 float lightTone=dot(normalize(surfaceNormal),normalize(vec3(-3.,6.,5.)));
 vec3 cell=floor(point*220.);
 float grain=fract(sin(dot(cell,vec3(12.9898,78.233,43.156)))*43758.5453);
 float inkPatch=sin(point.x*28.)*sin(point.y*31.)*sin(point.z*27.);
 float shade=smoothstep(.23,.30,lightTone+(grain-.5)*.19+inkPatch*.055);
 return mix(vec3(.0015,.001,.003),baseColor,shade);
}
`;
