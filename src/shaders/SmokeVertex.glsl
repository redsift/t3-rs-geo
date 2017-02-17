#define PI 3.141592653589793238462643
#define DISTANCE 500.0
attribute float myStartTime;
attribute float myStartLat;
attribute float myStartLon;
attribute float altitude;
attribute float active;
uniform float currentTime;
uniform vec3 color;
varying vec4 vColor;

vec3 getPos(float lat, float lon)
{
   if (lon < -180.0){
      lon = lon + 360.0;
   }
   float phi = (90.0 - lat) * PI / 180.0;
   float theta = (180.0 - lon) * PI / 180.0;
   float x = DISTANCE * sin(phi) * cos(theta) * altitude;
   float y = DISTANCE * cos(phi) * altitude;
   float z = DISTANCE * sin(phi) * sin(theta) * altitude;
   return vec3(x, y, z);
}

void main()
{
   float dt = currentTime - myStartTime;
   if (dt < 0.0){
      dt = 0.0;
   }
   if (dt > 0.0 && active > 0.0) {
      dt = mod(dt,1500.0);
   }
   float opacity = 1.0 - dt/ 1500.0;
   if (dt == 0.0 || active == 0.0){
      opacity = 0.0;
   }
   vec3 newPos = getPos(myStartLat, myStartLon - ( dt / 50.0));
   vColor = vec4( color, opacity ); // set color associated to vertex; use later in fragment shader.
   vec4 mvPosition = modelViewMatrix * vec4( newPos, 1.0 );
   gl_PointSize = 2.5 - (dt / 1500.0);
   gl_Position = projectionMatrix * mvPosition;
}
