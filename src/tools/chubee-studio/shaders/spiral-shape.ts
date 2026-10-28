// Shared living spiral for both characters. Coordinates span a unit disk.
export const spiralShapeGLSL = `
// thickness escala el ancho de la línea (1 = original).
float livingSpiral(vec2 q, float rotation, float life, float deform, float thickness) {
    float t=life;
    q+=deform*.035*vec2(sin(t*1.3+q.y*5.),cos(t*1.1+q.x*4.))*(1.-smoothstep(.65,1.,length(q)));
    float a=atan(q.y,q.x)+rotation;
    float polygon=cos(mod(a+3.14159265/3.,6.2831853/6.)-3.14159265/6.);
    float r=length(q)*mix(1.,polygon,.65);
    float pulse=1.+deform*.08*sin(t*1.7);
    float phase=a-r*17.*pulse+deform*.55*sin(r*10.-t*2.)+deform*.18*sin(a*3.+t);
    float line=abs(sin(phase*.5));
    float width=min((.40+deform*.07*sin(a*2.-t*1.8+r*5.))*thickness,.97);
    float aa=max(fwidth(line),.008);
    float ink=1.-smoothstep(width-aa,width+aa,line);
    ink*=1.-smoothstep(.90,.98,length(q));
    ink=max(ink,1.-smoothstep(.025,.045,length(q)));
    return ink;
}
float livingSpiral(vec2 q, float rotation, float life, float deform) { return livingSpiral(q, rotation, life, deform, 1.); }
`;
