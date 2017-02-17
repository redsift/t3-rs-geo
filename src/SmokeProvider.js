'use strict'

import {
    BufferGeometry, BufferAttribute, ShaderMaterial, Points, Color
} from 'three';

import { Smoke as CONST } from './Defaults'

import fragmentShader from './shaders/SmokeFragment.glsl'
import vertexShader from './shaders/SmokeVertex.glsl'

function SmokeProvider(scene, _opts) {
    var opts = {
        smokeCount: CONST.Count,
        smokePerPin: CONST.PerPin,
        smokePerSecond: CONST.PerSecond
    }

    if(_opts){
        for(var i in opts){
            if(_opts[i] !== undefined){
                opts[i] = _opts[i];
            }
        }
    }

    this.opts = opts;
    this.geometry = new BufferGeometry();
    
    let vertices = new Float32Array(opts.smokeCount * 3); // this is set by the shader but allocate the buffer
    this.geometry.addAttribute( 'position', new BufferAttribute( vertices, 3 ) );

    this.myStartTime = new Float32Array(opts.smokeCount);
    this.myStartLat = new Float32Array(opts.smokeCount);
    this.myStartLon = new Float32Array(opts.smokeCount);
    this.altitude = new Float32Array(opts.smokeCount);
    this.active = new Float32Array(opts.smokeCount);

    this.geometry.addAttribute( 'myStartTime', new BufferAttribute( this.myStartTime, 1 ) );
    this.geometry.addAttribute( 'myStartLat', new BufferAttribute( this.myStartLat, 1 ) );
    this.geometry.addAttribute( 'myStartLon', new BufferAttribute( this.myStartLon, 1 ) );
    this.geometry.addAttribute( 'altitude', new BufferAttribute( this.altitude, 1 ) );
    this.geometry.addAttribute( 'active', new BufferAttribute( this.active, 1 ) );    

    this.uniforms = {
        currentTime: { type: 'f', value: 0.0 },
        color: { type: 'c', value: new Color(CONST.Color) },
    }

    var material = new ShaderMaterial( {
        uniforms:       this.uniforms,
        vertexShader:   vertexShader,
        fragmentShader: fragmentShader,
        transparent:    true
    });

    this.smokeIndex = 0;
    this.totalRunTime = 0;

    scene.add( new Points( this.geometry, material));
}

SmokeProvider.prototype.color = function (value) {
    return arguments.length ? (this.uniforms.color.value = value, this) : this.uniforms.color.value;
}

SmokeProvider.prototype.setFire = function (lat, lon, altitude) {
    var startSmokeIndex = this.smokeIndex;

    for(let i = 0; i < this.opts.smokePerPin; i++){
        this.myStartTime[this.smokeIndex] = this.totalRunTime + (1000*i / this.opts.smokePerSecond + 1500);
        this.myStartLat[this.smokeIndex] = lat;
        this.myStartLon[this.smokeIndex] = lon;
        this.altitude[this.smokeIndex] = altitude;
        this.active[this.smokeIndex] = 1.0;

        this.smokeIndex++;
        this.smokeIndex = this.smokeIndex % this.active.length;
    }

    this.geometry.getAttribute('myStartTime').needsUpdate = true;
    this.geometry.getAttribute('myStartLat').needsUpdate = true;
    this.geometry.getAttribute('myStartLon').needsUpdate = true;
    this.geometry.getAttribute('altitude').needsUpdate = true;
    this.geometry.getAttribute('active').needsUpdate = true;

    return startSmokeIndex;
};

SmokeProvider.prototype.extinguish = function (index) {
    for (let i = 0; i < this.opts.smokePerPin; i++){
        this.active[(i + index) % this.opts.smokeCount] = 0.0;
    }
    this.geometry.getAttribute('active').needsUpdate = true;
};

SmokeProvider.prototype.changeAltitude = function (altitude, index) {
    for (let i = 0; i < this.opts.smokePerPin; i++){
        this.altitude[(i + index) % this.opts.smokeCount] = altitude;
    }
    this.geometry.getAttribute('altitude').needsUpdate = true;
};

SmokeProvider.prototype.tick = function (totalRunTime) {
    this.totalRunTime = totalRunTime;
    this.uniforms.currentTime.value = this.totalRunTime;
};

export default SmokeProvider;
