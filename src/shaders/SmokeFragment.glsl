varying vec4 vColor;     
void main() 
{
    gl_FragColor = vColor; 
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = smoothstep(1500.0, 1800.0, depth );
    vec3 fogColor = vec3(0.0);
    gl_FragColor = mix( vColor, vec4( fogColor, gl_FragColor.w), fogFactor );
}