'use strict'

import {
    ShaderMaterial, VertexColors, DoubleSide, BufferGeometry, BufferAttribute,
    PerspectiveCamera, Scene, Fog, Color, Mesh, LineBasicMaterial, Geometry,
    Vector3, Line, Object3D, WebGLRenderer, ShaderChunk, 
    VertexNormalsHelper
} from 'three';

import TWEEN from 'tween.js'
import { rgb, color } from 'd3-color'
import { interpolateRgbBasis } from "d3-interpolate";

import Quadtree2 from 'quadtree2'
import Vec2 from 'vec2'
import FontLoader from 'FontLoader'

import { latLon2d, mapPoint } from './Utils'
import { Render, View, Globes, Satellites, Labels } from './Defaults'

import { default as Satellite } from './Satellite'
import { default as Marker } from './Marker'
import { default as Pin } from './Pin'
import { default as SmokeProvider } from './SmokeProvider'

/*
 * e.g. load color brewer values via
 * import { interpolateYlOrBr as interpolateScheme } from 'd3-scale-chromatic'
 * 
 * interpolateGnBu - blue earth
 * interpolateOrRd - red earth etc
 * 
 * Below is a custom 'brown' earth
 */ 
const interpolateScheme = interpolateRgbBasis([ 
    "rgb(252, 237, 177)",
    "rgb(252, 220, 88)",
    "rgb(252, 202, 3)",
    "rgb(166, 133, 2)",
    "rgb(166, 144, 58)",
    "rgb(166, 156, 116)",
    "rgb(77, 72, 54)"].map(color));

// break geometry into
// chunks of 21,845 triangles (3 unique vertices per triangle)
// for indices to fit into 16 bit integer number
// floor(2^16 / 3) = 21845
const chunkSize = 21845;

// Array index for Tiny format
const TINY = {
    V: 0,
    A: 1,
    T: 2,
    L: 3,
    B: 4
};

const COLOR_ALT = {
    R: 3.0/255.0,
    G: 21.0/255.0,
    B: 61.0/255.0            
};

function addInitialData() {
    let next = null;
    if (this.data.length == 0){
        return;
    }
    while (this.data.length > 0 && this.firstRunTime + (next = this.data.pop()).when < Date.now()){
        this.addPin(next.lat, next.lng, next.label);
    }

    if (this.firstRunTime + next.when >= Date.now()){
        this.data.push(next);
    }
}

/* globe constructor */
function Globe(width, height, opts){
    opts = opts || {};
    
    this.data = (opts.data ? opts.data.map(d => Object.assign({}, d)) : null) || []; // copy data as it is modified
    this.tiles = opts.tiles || [];

    this.width = width;
    this.height = height;
    this.points = [];
    this.introLines = new Object3D();
    this.pins = [];
    this.markers = [];
    this.satelliteAnimations = [];
    this.satelliteMeshes = [];
    this.satellites = {};
    this.quadtree = new Quadtree2({ size: new Vec2(180, 360), objectLimit: 5 });
    this.active = true;

    // Adding odd hack to work with current packages
    this.quadtree.setKey('pos', 'pos_');
    this.quadtree.setKey('rad', 'rad_');
    // end hack

    this.maxPins = 500;
    this.maxMarkers = 4;
    this.viewAngle = 0;
    this.dayLength = 28000;
   
    this.scale = View.Scale;

    this.baseColor = opts.globeColor || Globes.Color;

    this.introLinesAltitude = opts.introLinesAltitude || View.IntroLineAltitude;
    this.introLinesDuration = opts.introLinesDuration || View.IntroLineDuration_MS;
    this.introLinesColor = opts.introLinesColor || View.IntroLineColor;
    this.introLinesCount = opts.introLinesCount || View.IntroLineCount;

    this.introDataOffset = opts.introDataOffset || View.IntroDataOffset_MS; // wait till data animation
    this.introDataDuration = opts.introDataDuration || View.IntroDataDuration_MS; // length of data animation

    this.opts = opts;
    this.opts.background = this.opts.background || View.Color
    this.opts.fog = this.opts.fog || View.Color
    this.opts.font = this.opts.font || Labels.TextFont

    this.setScale(this.scale);

    this.renderer = new WebGLRenderer({ antialias: true });

    this.renderer.setClearColor(this.opts.background);
    this.renderer.setPixelRatio(Render.PixelRatio);
    this.renderer.setSize(this.width, this.height);

    this.renderer.gammaInput = true;
    this.renderer.gammaOutput = true;

    this.domElement = this.renderer.domElement;

    this.data.sort((a,b) => (b.lng - b.label.length * 2) - (a.lng - a.label.length * 2));

    for (let i = 0; i < this.data.length; i++) {
        this.data[i].when = this.introDataDuration * ((180.0 + this.data[i].lng) / 360.0) + this.introDataOffset; 
    }

    this.ready = new Promise(function(ok, ko) {
        // need to wait for fonts before we can render labels etc
        const fontLoader = new FontLoader([ opts.font ], {
            complete: function(error) {
                if (error != null) {
                    ko(error);
                } else {
                    ok();
                }
            }
        }, View.FontTimeout_MS);
        fontLoader.loadFonts();        
    });

    this.ready.then(() => this.init());
}

/* 
 * Init or re-init the globe
 *  
 * */
Globe.prototype.init = function() {
    // create the camera
    this.camera = new PerspectiveCamera(50, this.width / this.height, 1, this.cameraDistance + View.Depth);
    this.camera.position.z = this.cameraDistance;

    this.cameraAngle = Math.PI;

    // create the scene
    this.scene = new Scene();

    this.scene.fog = new Fog(this.opts.fog, this.cameraDistance, this.cameraDistance + View.Depth);

    // create the smoke particles
    this.smokeProvider = new SmokeProvider(this.scene);

    this.createIntroLines();
    this.createParticles();
};

Globe.prototype.destroy = function(callback) {
    this.active = false;

    setTimeout(() => {
        while (this.scene.children.length > 0){
            this.scene.remove(this.scene.children[0]);
        }
        if (typeof callback == "function") {
            callback();
        }
    }, 1000);
};

Globe.prototype.resize = function(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
};

Globe.prototype.addPin = function(lat, lon, text, opts) {

    lat = parseFloat(lat);
    lon = parseFloat(lon);

    let altitude = 1.2;

    if (typeof text != "string" || text.length === 0){
        altitude -= .05 + Math.random() * .05;
    }

    const pin = new Pin(lat, lon, text, altitude, this.scene, this.smokeProvider, opts);

    this.pins.push(pin);

    // lets add quadtree stuff

    const pos = latLon2d(lat, lon);

    pin.pos_ = new Vec2(parseInt(pos.x),parseInt(pos.y)); 

    if (text.length > 0){
        pin.rad_ = pos.rad;
    } else {
        pin.rad_ = 1;
    }

    this.quadtree.addObject(pin);

    if (text.length > 0){
        const collisions = this.quadtree.getCollidings(pin);
        let collisionCount = 0;
        let tooYoungCount = 0;
        let hidePins = [];

        for (let i in collisions){
            if (collisions[i].text.length > 0){
                collisionCount++;
                if(collisions[i].age() > 5000){
                    hidePins.push(collisions[i]);
                } else {
                    tooYoungCount++;
                }
            }
        }

        if (collisionCount > 0 && tooYoungCount == 0){
            for (let i = 0; i< hidePins.length; i++){
                hidePins[i].hideLabel();
                hidePins[i].hideSmoke();
                hidePins[i].hideTop();
                hidePins[i].changeAltitude(Math.random() * .05 + 1.1);
            }
        } else if (collisionCount > 0){
            pin.hideLabel();
            pin.hideSmoke();
            pin.hideTop();
            pin.changeAltitude(Math.random() * .05 + 1.1);
        }
    }

    if (this.pins.length > this.maxPins){
        let oldPin = this.pins.shift();
        this.quadtree.removeObject(oldPin);
        oldPin.remove();

    }

    return pin;
}

Globe.prototype.smoke  = function(value) {
    if (value === true) {
        this.pins.forEach(p => p.showSmoke());
    } else {
        this.pins.forEach(p => p.hideSmoke());
    }
}  

//TODO: Clean up this API
Globe.prototype.addMarker = function(lat, lon, text, connected, opts) {
    if (typeof lat === "object") {
        text = lat.label;
        lon = lat.lon;
        lat = lat.lat;
    }
    let marker;
    const scale = () => this.scale;
    if (connected === true) {
        marker = new Marker(lat, lon, text, 1.2, scale, this.markers[this.markers.length-1], this.scene, this.camera.near, this.camera.far, opts);
    } else if(typeof connected == "object"){
        marker = new Marker(lat, lon, text, 1.2, scale, connected, this.scene, this.camera.near, this.camera.far, opts);
    } else {
        marker = new Marker(lat, lon, text, 1.2, scale, null, this.scene, this.camera.near, this.camera.far, opts);
    }

    this.markers.push(marker);

    if(this.markers.length > this.maxMarkers){
        this.markers.shift().remove();
    }

    return marker;
}

Globe.prototype.addSatellite = function(lat, lon, altitude, opts, texture, animator){
    /* texture and animator are optimizations so we don't have to regenerate certain 
     * redundant assets */

    opts = opts ||{};
    opts.coreColor = opts.coreColor || Satellites.Color;

    const satellite = new Satellite(lat, lon, altitude, this.scene, opts, texture, animator);

    if (!this.satellites[satellite.toString()]) {
        this.satellites[satellite.toString()] = satellite;
    }

    satellite.onRemove(() => delete this.satellites[satellite.toString()]);
    return satellite;

};

Globe.prototype.addConstellation = function(sats, opts){
    /* TODO: make it so that when you remove the first in a constellation it removes all others */

    let constellation = [];
    let satellite = null;

    for(let i = 0; i < sats.length; i++) {
        if(i === 0){
            satellite = this.addSatellite(sats[i].lat, sats[i].lon, sats[i].altitude, opts);
        } else {
            satellite = this.addSatellite(sats[i].lat, sats[i].lon, sats[i].altitude, opts, constellation[0].canvas, constellation[0].texture);
        }
        constellation.push(satellite);
    }

    return constellation;
};


Globe.prototype.setMaxPins = function(_maxPins){
    this.maxPins = _maxPins;

    while(this.pins.length > this.maxPins){
        const oldPin = this.pins.shift();
        this.quadtree.removeObject(oldPin);
        oldPin.remove();
    }
};

Globe.prototype.setMaxMarkers = function(_maxMarkers){
    this.maxMarkers = _maxMarkers;
    while(this.markers.length > this.maxMarkers){
        this.markers.shift().remove();
    }
};

Globe.prototype.setBaseColor = function(_color){
    this.baseColor = _color;
    this.createParticles();
};

Globe.prototype.setScale = function(_scale){
    this.scale = _scale;

    this.markers.forEach(m => m.rescale(_scale)); // rescale the markers to look good

    this.cameraDistance = 1700/_scale;
    if (this.scene && this.scene.fog){
       this.scene.fog.near = this.cameraDistance;
       this.scene.fog.far = this.cameraDistance + View.Depth;
//     TODO: Update fog values
//     this.createParticles();
       this.camera.far = this.cameraDistance + View.Depth;
       this.camera.updateProjectionMatrix();
    }
};

Globe.prototype.tick = function(){

    if (!this.camera){
        return;
    }

    if (!this.firstRunTime){
        this.firstRunTime = Date.now();
    }

    addInitialData.call(this);
    TWEEN.update();

    if (!this.lastRenderDate){
        this.lastRenderDate = new Date();
    }

    if (!this.firstRenderDate){
        this.firstRenderDate = new Date();
    }

    this.totalRunTime = new Date() - this.firstRenderDate;

    const renderTime = new Date() - this.lastRenderDate;
    this.lastRenderDate = new Date();
    let rotateCameraBy = 0;
    
    if (this.dayLength > 0) {
        rotateCameraBy = (2 * Math.PI)/(this.dayLength/renderTime);
    }
    
    this.cameraAngle += rotateCameraBy;

    if (!this.active){
        this.cameraDistance += (1000 * renderTime/1000);
    }

    this.camera.position.x = this.cameraDistance * Math.cos(this.cameraAngle) * Math.cos(this.viewAngle);
    this.camera.position.y = Math.sin(this.viewAngle) * this.cameraDistance;
    this.camera.position.z = this.cameraDistance * Math.sin(this.cameraAngle) * Math.cos(this.viewAngle);

    for (let i in this.satellites){
        this.satellites[i].tick(this.camera.position, this.cameraAngle, renderTime);
    }

    for (let i = 0; i< this.satelliteMeshes.length; i++){
        const mesh = this.satelliteMeshes[i];
        mesh.lookAt(this.camera.position);
        mesh.rotateZ(mesh.tiltDirection * Math.PI/2);
        mesh.rotateZ(Math.sin(this.cameraAngle + (mesh.lon / 180) * Math.PI) * mesh.tiltMultiplier * mesh.tiltDirection * -1);
    }

    if (this.introLinesDuration > this.totalRunTime){
        if(this.totalRunTime/this.introLinesDuration < .1){
            this.introLines.children[0].material.opacity = (this.totalRunTime/this.introLinesDuration) * (1 / .1) - .2;
        }if(this.totalRunTime/this.introLinesDuration > .8){
            this.introLines.children[0].material.opacity = Math.max(1-this.totalRunTime/this.introLinesDuration,0) * (1 / .2);
        } else {
            this.introLines.children[0].material.opacity = 1;
        }
        this.introLines.rotateY((2 * Math.PI)/(this.introLinesDuration/renderTime));
    } else if(this.introLines){
        this.scene.remove(this.introLines);
        delete[this.introLines];
    }

    // do the shaders

    this.pointUniforms.currentTime.value = this.totalRunTime;

    this.smokeProvider.tick(this.totalRunTime);

    this.camera.lookAt(this.scene.position);
    this.renderer.render(this.scene, this.camera);
}

//TODO: Atmosphere shader?
// https://www.shadertoy.com/view/lslXDr
//TODO: Sea shader?
// https://www.shadertoy.com/view/Ms2SD1
Globe.prototype.createParticles = function () {
    if (this.hexGrid){
        this.scene.remove(this.hexGrid);
    }

    var pointVertexShader = [
        '#define USE_FOG',
        "#define PI 3.141592653589793238462643",
        "#define DISTANCE 500.0",
        "#define INTRODURATION " + (parseFloat(this.introLinesDuration) + .00001),
        "#define INTROALTITUDE " + (parseFloat(this.introLinesAltitude) + .00001),
        "attribute float lng;",
        "uniform float currentTime;",
        "varying vec4 vColor;",
        ShaderChunk[ "fog_pars_vertex" ],
        "",
        "void main()",
        "{",
        "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
        "   vec3 newPos = position;",
        "   float opacityVal = 0.0;",
        "   float introStart = INTRODURATION * ((180.0 + lng)/360.0);",
        "   if(currentTime > introStart){",
        "      opacityVal = 1.0;",
        "   }",
        "   if(currentTime > introStart && currentTime < introStart + INTRODURATION / 8.0){",
        "      newPos = position * INTROALTITUDE;",
        "      opacityVal = .3;",
        "   }",
        "   if(currentTime > introStart + INTRODURATION / 8.0 && currentTime < introStart + INTRODURATION / 8.0 + 200.0){",
        "      newPos = position * (1.0 + ((INTROALTITUDE-1.0) * (1.0-(currentTime - introStart-(INTRODURATION/8.0))/200.0)));",
        "   }",
        "   vColor = vec4( color, opacityVal );", //     set color associated to vertex; use later in fragment shader.
        "   gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);",
        ShaderChunk[ "fog_vertex" ],
        "}"
    ].join("\n");

    var pointFragmentShader = [
        '#define USE_FOG',
        "varying vec4 vColor;",  
        ShaderChunk[ "common" ],
        ShaderChunk[ "fog_pars_fragment" ],   
        "void main()", 
        "{",
        "   gl_FragColor = vColor;",
        ShaderChunk[ "fog_fragment" ],
        "}"
    ].join("\n");

    this.pointUniforms = {
        fogNear: { value: this.cameraDistance },
        fogFar: { value: this.cameraDistance + View.Depth },
        fogColor: { value: new Color(this.opts.fog) },
        currentTime: { type: 'f', value: 0.0}
    };

    const pointMaterial = new ShaderMaterial( {
        uniforms:       this.pointUniforms,
        vertexShader:   pointVertexShader,
        fragmentShader: pointFragmentShader,
        transparent:    true,
        vertexColors: VertexColors,
        side: DoubleSide
    });

    const geometry = new BufferGeometry();

    const triangles = this.tiles.length * 4;

    const lng_values = new Float32Array(triangles * 3);
    const positions = new Float32Array(triangles * 3 * 3);
    const colors = new Float32Array(triangles * 3 * 3);

    geometry.addAttribute( 'position', new BufferAttribute( positions, 3 ) );
    geometry.addAttribute( 'color', new BufferAttribute( colors, 3 ) );
    geometry.addAttribute( 'lng', new BufferAttribute( lng_values, 1 ) );

/*  TODO: Zap
    const baseColorSet = pusherColor(this.baseColor).hueSet();
    const myColors = baseColorSet; 
    for (let i = 0; i< baseColorSet.length; i++){
        console.log('%c '+ myColors[i].rgb(), 'background:' + myColors[i].html());
    }
*/
    const addTriangle = (k, ax, ay, az, bx, by, bz, cx, cy, cz, lat, lng, color) => {
        const p = k * 3;
        const i = p * 3;

        lng_values[ p ] = lng;
        lng_values[ p+1 ] = lng;
        lng_values[ p+2 ] = lng;

        positions[ i ]     = ax;
        positions[ i + 1 ] = ay;
        positions[ i + 2 ] = az;

        positions[ i + 3 ] = bx;
        positions[ i + 4 ] = by;
        positions[ i + 5 ] = bz;

        positions[ i + 6 ] = cx;
        positions[ i + 7 ] = cy;
        positions[ i + 8 ] = cz;

        colors[ i ]     = color.r;
        colors[ i + 1 ] = color.g;
        colors[ i + 2 ] = color.b;

        colors[ i + 3 ] = color.r;
        colors[ i + 4 ] = color.g;
        colors[ i + 5 ] = color.b;

        colors[ i + 6 ] = color.r;
        colors[ i + 7 ] = color.g;
        colors[ i + 8 ] = color.b;

    };

    for (let i = 0; i < this.tiles.length; i++){
        const t = this.tiles[i];
        const k = i * 4;

        //Map by height, population etc based on something in the tile
        let v = t[TINY.V];
        if (v == null) {
            v = Math.random();
        }

        //const colorIndex = Math.floor(v * (myColors.length - 1));

        // const colorRGB = myColors[colorIndex].rgb();
        const color = new Color();


        if (t[TINY.A]) {
            color.setRGB(COLOR_ALT.R, COLOR_ALT.G, COLOR_ALT.B);
        } else {
            const colorRGB = rgb(interpolateScheme(v));

            color.setRGB(colorRGB.r/255.0, colorRGB.g/255.0, colorRGB.b/255.0);
        }
        
        for (let s = 0; s < 3; s++) {
            addTriangle(k + s,  t[TINY.B+(3*0)+0],      t[TINY.B+(3*0)+1],      t[TINY.B+(3*0)+2], 
                                t[TINY.B+(3*(1+s))+0],  t[TINY.B+(3*(1+s))+1],  t[TINY.B+(3*(1+s))+2], 
                                t[TINY.B+(3*(2+s))+0],  t[TINY.B+(3*(2+s))+1],  t[TINY.B+(3*(2+s))+2], 
                                t[TINY.T], t[TINY.L], color);
        }
        if ((t.length - TINY.B) > 5*3) {
            addTriangle(k + 3,  t[TINY.B+(3*0)+0],      t[TINY.B+(3*0)+1],      t[TINY.B+(3*0)+2], 
                                t[TINY.B+(3*(5))+0],  t[TINY.B+(3*(5))+1],  t[TINY.B+(3*(5))+2], 
                                t[TINY.B+(3*(4))+0],  t[TINY.B+(3*(4))+1],  t[TINY.B+(3*(4))+2], 
                                t[TINY.T], t[TINY.L], color);
        }
        /*
        addTriangle(k, t.b[0].x, t.b[0].y, t.b[0].z, t.b[1].x, t.b[1].y, t.b[1].z, t.b[2].x, t.b[2].y, t.b[2].z, t[TINY.T], t[TINY.L], color);
        addTriangle(k+1, t.b[0].x, t.b[0].y, t.b[0].z, t.b[2].x, t.b[2].y, t.b[2].z, t.b[3].x, t.b[3].y, t.b[3].z, t[TINY.T], t[TINY.L], color);
        addTriangle(k+2, t.b[0].x, t.b[0].y, t.b[0].z, t.b[3].x, t.b[3].y, t.b[3].z, t.b[4].x, t.b[4].y, t.b[4].z, t[TINY.T], t[TINY.L], color);

        if (t.b.length > 5){ // for the occasional pentagon that i have to deal with
            addTriangle(k+3, t.b[0].x, t.b[0].y, t.b[0].z, t.b[5].x, t.b[5].y, t.b[5].z, t.b[4].x, t.b[4].y, t.b[4].z, t[TINY.T], t[TINY.L], color);
        }
        */
    }

    const offsets = triangles / chunkSize;

    for (let i = 0; i < offsets; i++) {
        const offset = {
            start: i * chunkSize * 3,
            index: i * chunkSize * 3,
            count: Math.min( triangles - ( i * chunkSize ), chunkSize ) * 3
        };

        geometry.groups.push(offset);
    }

    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();

    this.hexGrid = new Mesh( geometry, pointMaterial );
    this.scene.add(this.hexGrid);
    /* Display mesh normals for debugging
    this.scene.add(new VertexNormalsHelper(this.hexGrid, 10, 0x00ff00, 1));
     */
}

Globe.prototype.createIntroLines = function () {
    let sPoint;
    const introLinesMaterial = new LineBasicMaterial({
        color: this.introLinesColor,
        transparent: true,
        linewidth: 2,
        opacity: .5
    });

    for (let i = 0; i<this.introLinesCount; i++){
        const geometry = new Geometry();

        const lat = Math.random()*180 + 90;
        let lon =  Math.random()*5;
        let lenBase = 4 + Math.floor(Math.random()*5);

        if (Math.random() < 0.3) {
            lon = Math.random()*30 - 50;
            lenBase = 3 + Math.floor(Math.random()*3);
        }

        for (let j = 0; j< lenBase; j++){
            const thisPoint = mapPoint(lat, lon - j * 5);
            sPoint = new Vector3(thisPoint.x*this.introLinesAltitude, thisPoint.y*this.introLinesAltitude, thisPoint.z*this.introLinesAltitude);

            geometry.vertices.push(sPoint);  
        }

        this.introLines.add(new Line(geometry, introLinesMaterial));

    }
    this.scene.add(this.introLines);
}

export default Globe;
