'use strict'

import {
    Geometry, LineBasicMaterial, SpriteMaterial, Sprite, CanvasTexture, Line, Vector3
} from 'three';

import TWEEN from 'tween.js'

import { mapPoint, renderToCanvas, createLabel, PI_2 } from './Utils'
import { Pins, Render } from './Defaults'

function createTopTexture(pin) {
    pin = pin || {};
    pin.size = pin.size || Pins.Canvas;
    pin.color = pin.color || Pins.Color;
    pin.outer = pin.outer || Pins.RadiusOuter

    const canvas = renderToCanvas(pin.size, pin.size, function(ctx) {
        const arcW = pin.size / 2;
        const arcH = pin.size / 2;

        ctx.fillStyle = pin.color;
        ctx.beginPath();
        ctx.arc(arcW, arcH, pin.outer, 0, PI_2);
        ctx.fill();
    });

    const texture = new CanvasTexture(canvas);
    texture.name = "top";
    return texture;
}

function Pin(lat, lon, text, altitude, scene, smokeProvider, opts) {
    this.lat = lat;
    this.lon = lon;
    this.text = text;
    this.altitude = altitude;
    this.scene = scene;
    this.smokeProvider = smokeProvider;
    this.dateCreated = Date.now();

    const hasText = (text.length > 0);

    this.opts = opts;

    this.opts.showLabel = this.opts.showLabel == null ? hasText : this.showLabel;
    this.opts.showTop = this.opts.showTop == null ? hasText : this.showTop;
    this.opts.showSmoke = this.opts.showSmoke == null ? hasText : this.showSmoke;

    /* the line */
    this.lineGeometry = new Geometry();
    const lineMaterial = new LineBasicMaterial({
        color: this.opts.pin.line,
        linewidth: 1
    });

    const point = mapPoint(lat,lon);

    this.lineGeometry.vertices.push(new Vector3(point.x, point.y, point.z));
    this.lineGeometry.vertices.push(new Vector3(point.x, point.y, point.z));
    this.line = new Line(this.lineGeometry, lineMaterial);

    /* the label */

    const labelCanvas = createLabel(text, this.opts.label.font);
    const labelTexture = new CanvasTexture(labelCanvas);
    labelTexture.name = "pin-label";

    const labelMaterial = new SpriteMaterial({
        map: labelTexture,
        opacity: 0,
        depthTest: true,
        fog: true
    });

    this.labelSprite = new Sprite(labelMaterial);
    this.labelSprite.position.set(point.x*altitude*1.1, point.y*altitude + (point.y < 0 ? -15 : 30), point.z*altitude*1.1);
    this.labelSprite.scale.set(labelCanvas.width / Render.PixelRatio, labelCanvas.height / Render.PixelRatio);

    /* the top */

    if (!scene.topTexture) {
        scene.topTexture = createTopTexture(this.opts.pin); 
    }
    const topMaterial = new SpriteMaterial({map: scene.topTexture, depthTest: true, fog: true, opacity: 0});
    this.topSprite = new Sprite(topMaterial);
    this.topSprite.scale.set(this.opts.pin.size, this.opts.pin.size);
    this.topSprite.position.set(point.x * altitude, point.y * altitude, point.z * altitude);

    /* the smoke */
    if (this.opts.showSmoke) {
        this.smokeId = smokeProvider.setFire(lat, lon, altitude);
    }

    const _this = this; //arghhh

    /* intro animations */
    if (opts.showTop || opts.showLabel) {
        new TWEEN.Tween( {opacity: 0})
                    .to({opacity: 1}, this.opts.pin.fadeTime)
                    .onUpdate(function(){
                        if(_this.opts.showTop){
                            topMaterial.opacity = this.opacity;
                        } else {
                            topMaterial.opacity = 0;
                        }
                        if(_this.opts.showLabel){
                            labelMaterial.opacity = this.opacity;
                        } else {
                            labelMaterial.opacity = 0;
                        }
                    })
                    .delay(this.opts.pin.drawTime - this.opts.pin.fadeTime)
                    .start();
    }

    new TWEEN.Tween(point)
            .to({ x: point.x*altitude, y: point.y*altitude, z: point.z*altitude }, this.opts.pin.drawTime)
            .easing(TWEEN.Easing.Elastic.Out)
            .onUpdate(function() {
                _this.lineGeometry.vertices[1].x = this.x;
                _this.lineGeometry.vertices[1].y = this.y;
                _this.lineGeometry.vertices[1].z = this.z;
                _this.lineGeometry.verticesNeedUpdate = true;
            })
            .start();

    /* add to scene */

    this.scene.add(this.labelSprite);
    this.scene.add(this.line);
    this.scene.add(this.topSprite);

}

Pin.prototype.toString = function() {
    return `${this.lat}_${this.lon}`;
}

Pin.prototype.changeAltitude = function(altitude) {
    const point = mapPoint(this.lat, this.lon);
    const _this = this; // arghhhh

   new TWEEN.Tween({altitude: this.altitude})
                .to({altitude: altitude}, 1500)
                .easing(TWEEN.Easing.Elastic.Out)
                .onUpdate(function() {
                    if(_this.opts.showSmoke) {
                        _this.smokeProvider.changeAltitude(this.altitude, _this.smokeId);
                    }
                    if(_this.opts.showTop) {
                        _this.topSprite.position.set(point.x * this.altitude, point.y * this.altitude, point.z * this.altitude);
                    }
                    if(_this.opts.showLabel) {
                        _this.labelSprite.position.set(point.x*this.altitude*1.1, point.y*this.altitude + (point.y < 0 ? -15 : 30), point.z*this.altitude*1.1);
                    }
                    _this.lineGeometry.vertices[1].x = point.x * this.altitude;
                    _this.lineGeometry.vertices[1].y = point.y * this.altitude;
                    _this.lineGeometry.vertices[1].z = point.z * this.altitude;
                    _this.lineGeometry.verticesNeedUpdate = true;

                })
                .onComplete(function(){
                    _this.altitude = altitude;
                    
                })
                .start();

};

Pin.prototype.hideTop = function() {
    if (this.opts.showTop){
        this.topSprite.material.opacity = 0.0;
        this.opts.showTop = false;
    }
};

Pin.prototype.showTop = function() {
    if (!this.opts.showTop){
        this.topSprite.material.opacity = 1.0;
        this.opts.showTop = true;
    }
};

Pin.prototype.hideLabel = function() {
    if (this.opts.showLabel){
        this.labelSprite.material.opacity = 0.0;
        this.opts.showLabel = false;
    }
};

Pin.prototype.showLabel = function() {
    if (!this.opts.showLabel){
        this.labelSprite.material.opacity = 1.0;
        this.opts.showLabel = true;
    }
};

Pin.prototype.hideSmoke = function() {
    if (this.opts.showSmoke){
        this.smokeProvider.extinguish(this.smokeId);
        this.opts.showSmoke = false;
    }
};

Pin.prototype.showSmoke = function() {
    if (!this.opts.showSmoke){
        this.smokeId  = this.smokeProvider.setFire(this.lat, this.lon, this.altitude);
        this.opts.showSmoke = true;
    }
};

Pin.prototype.age = function() {
    return Date.now() - this.dateCreated;

};

Pin.prototype.remove = function() {
    this.scene.remove(this.labelSprite);
    this.scene.remove(this.line);
    this.scene.remove(this.topSprite);

    if (this.opts.showSmoke){
        this.smokeProvider.extinguish(this.smokeId);
    }
};

export default Pin;
