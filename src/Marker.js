'use strict'

import {
    Geometry, CanvasTexture, LineSegments, Mesh, LineBasicMaterial, SpriteMaterial, Sprite, Texture, 
    Vector3, Color, AdditiveBlending, DoubleSide, Vector2
} from 'three';

import MeshLine from 'three.meshline'
import TWEEN from 'tween.js'

import { renderToCanvas, mapPoint, createLabel, latLonHaversine, PI_2 } from './Utils'
import { Markers, Lines, Labels, Render } from './Defaults'

const SPOT_NEXT = 1.2;

function createMarkerTexture(marker) {
    marker = marker || {};
    marker.size = marker.size || Markers.Canvas;
    marker.color = marker.color || Markers.Color;
    marker.outer = marker.outer || Markers.RadiusOuter;
    marker.inner = marker.inner || Markers.RadiusInner;
    marker.stroke = marker.stroke || Markers.StrokeOuter;

    const canvas = renderToCanvas(marker.size, marker.size, function(ctx) {
        const arcW = marker.size / 2;
        const arcH = marker.size / 2;

        ctx.fillStyle = marker.color;
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = marker.stroke;
        ctx.beginPath();
        ctx.arc(arcW, arcH, marker.outer, 0, PI_2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(arcW, arcH, marker.inner, 0, PI_2);
        ctx.fill();
    });

    const texture = new CanvasTexture(canvas);
    texture.name = "marker";
    return texture;
}

function createLineTexture(line) {
    line = line || {};
    line.size = line.size || Lines.Canvas;

    const canvas = renderToCanvas(line.size, line.size, function (context) {
        // creates a alpha modulation texture
        // that looks like Contrails

        const RGB_ON = 'rgba(255, 255, 255, 1.0)';
        const RGB_OFF = 'rgba(255, 255, 255, 0.0)';
        const RGB_MID = 'rgba(255, 255, 255, 0.33)';

        const gradient = context.createLinearGradient(0, 0, 0, line.size);
        gradient.addColorStop(0.00, RGB_OFF);
        gradient.addColorStop(0.10, RGB_OFF);
        gradient.addColorStop(0.25, RGB_ON);
        gradient.addColorStop(0.50, RGB_MID);  
        gradient.addColorStop(0.75, RGB_ON);
        gradient.addColorStop(0.90, RGB_OFF);
        gradient.addColorStop(1.00, RGB_OFF);
        context.fillStyle = gradient;
        context.fillRect(0, 0, line.size, line.size);

    });

    const texture = new CanvasTexture(canvas);
    texture.name = "line";

    return texture;
}

function attenuateScale(scale) {
    return Math.pow(Math.max(scale, 1), 2.5)
}

function Marker(lat, lon, text, altitude, scale, previous, scene, near, far, opts) {
    text = text || "";

    this.lat = parseFloat(lat);
    this.lon = parseFloat(lon);
    this.altitude = parseFloat(altitude);
    this.scale = scale;

    this.text = text;
    this.scene = scene;
    this.previous = previous;
    this.next = [];

    if (this.previous){
        this.previous.next.push(this);
    }

    opts = opts || {};
    this.opts = opts;
    this.opts.lines = this.opts.lines || {};
    this.opts.lines.color = this.opts.lines.color || Lines.Color;
    this.opts.lines.segments = this.opts.lines.segments || Lines.Segments;
    this.opts.lines.opacity = this.opts.lines.opacity || Lines.Opacity;
    this.opts.lines.width = this.opts.lines.width || Lines.Width;
    this.opts.lines.dotwiggle = this.opts.lines.dotwiggle || Lines.DotWiggle;
    this.opts.lines.drawTime = this.opts.lines.drawTime || Lines.Draw_MS;

    this.opts.marker = this.opts.marker || {};
    this.opts.marker.size = this.opts.marker.size || Markers.Canvas;
    this.opts.marker.opacity = this.opts.marker.opacity || Markers.Opacity;
    this.opts.marker.scale = this.opts.marker.scale || Markers.Scale_MS;

    this.opts.label = this.opts.label || {};
    this.opts.label.font = this.opts.label.font || {};
    this.opts.label.underline = this.opts.label.underline || {};
    this.opts.label.fade = this.opts.label.fade || Labels.Fade_MS;

    let point = mapPoint(lat, lon);

    // -- marker the ()
    if (!scene.markerTexture) {
        scene.markerTexture = createMarkerTexture(this.opts.marker);
    }

    let markerMaterial = new SpriteMaterial({ map: scene.markerTexture, 
                                                    opacity: this.opts.marker.opacity, 
                                                    depthTest: true, 
                                                    fog: true });

    const marker = new Sprite(markerMaterial);
    this.marker = marker;
    this.marker.scale.set(0, 0);
    this.marker.position.set(point.x * altitude, point.y * altitude, point.z * altitude);

    new TWEEN.Tween({x: 0, y: 0})
                .to({x: this.opts.marker.size, y: this.opts.marker.size}, this.opts.marker.scale)
                .easing(TWEEN.Easing.Elastic.Out)
                .onUpdate(function() {
                    const s = attenuateScale(scale());
                    marker.scale.set(this.x / s, this.y / s);
                })
                .delay((this.previous ? this.opts.lines.drawTime : 0)) // the next marker only starts after line is done
                .start();
    // -- end marker

    // -- text label
    let labelCanvas = createLabel(text.toUpperCase(), this.opts.label.font, this.opts.label.underline, this.opts.label.background);
    let labelTexture = new Texture(labelCanvas);
    labelTexture.name = "marker-label"
    labelTexture.needsUpdate = true;

    let labelMaterial = new SpriteMaterial({
        map : labelTexture,
        opacity: 0,
        transparent: (this.opts.label.fade > 0),
        depthTest: true,
        fog: true
    });

    this.labelSprite = new Sprite(labelMaterial);
    this.labelSprite.position.set(point.x * altitude * 1.1, point.y * altitude * 1.05 + (point.y < 0 ? -15 : 30), point.z * altitude * 1.1); 
    
    this.labelScale = {
        x: labelCanvas.width / Render.PixelRatio,
        y: labelCanvas.height / Render.PixelRatio
    };
    this.labelSprite.scale.set(this.labelScale.x / scale(), this.labelScale.y / scale());

    new TWEEN.Tween({opacity: 0})
                .to({opacity: 1}, this.opts.label.fade)
                .onUpdate(function() {
                    labelMaterial.opacity = this.opacity
                })
                .start();
    // -- end text label

  if (this.previous) {
        this.geometrySpline = new Geometry();
        this.geometrySplineDotted = new Geometry();

        let latdist = (lat - previous.lat) / this.opts.lines.segments;
        let londist = (lon - previous.lon) / this.opts.lines.segments;
        let startPoint = mapPoint(previous.lat,previous.lon);
        const pointList = [];
        const pointList2 = [];

        const meters = latLonHaversine(lat, lon, previous.lat, previous.lon);
        
        for (let j = 0; j< this.opts.lines.segments + 1; j++) {

            // lat is wiggled but too much wiggle looks odd at 
            // 637766 = straight
            // 6564392 = arc
            let nextlat = (((90 + previous.lat + j*latdist)%180)-90);
            if (meters > 3000000) { // TODO: hack, this could be better
                nextlat = nextlat * (0.5 + Math.cos(j*(5*Math.PI/2)/this.opts.lines.segments)/2) + (j*lat/this.opts.lines.segments/2);
            }


            let nextlon = ((180 + previous.lon + j*londist)%360)-180;
            pointList.push({lat: nextlat, lon: nextlon, index: j});
            if (j == 0 || j == this.opts.lines.segments){
                pointList2.push({lat: nextlat, lon: nextlon, index: j});
            } else {
                pointList2.push({lat: nextlat+1, lon: nextlon, index: j});
            }

            let sPoint = new Vector3(startPoint.x * SPOT_NEXT, startPoint.y * SPOT_NEXT, startPoint.z * SPOT_NEXT);
            let sPoint2 = new Vector3(startPoint.x * SPOT_NEXT, startPoint.y * SPOT_NEXT, startPoint.z * SPOT_NEXT);

            sPoint.globe_index = j;
            sPoint2.globe_index = j;

            this.geometrySpline.vertices.push(sPoint);  
            this.geometrySplineDotted.vertices.push(sPoint2);  
        }

        // -- mesh line
        if (!scene.lineTexture) {
            scene.lineTexture = createLineTexture(this.opts.lines);
        }

        if (!this.meshLine) {
            this.meshLine = new MeshLine.MeshLine();
        }

        const sizeFunction = (p) => 0.5 + 3 * Math.sin(p * Math.PI);
        this.meshLine.setGeometry(this.geometrySpline, sizeFunction);

        const materialMeshSpline = new MeshLine.MeshLineMaterial({ 
            useMap: true,
            map: scene.lineTexture,
            color: new Color(this.opts.lines.color),
            opacity: this.opts.lines.opacity,
            lineWidth: this.opts.lines.width, 
            transparent: true,
            blending: AdditiveBlending,
            side: DoubleSide,
            depthTest: false, //todo: odd blend when depth test is true
            resolution: new Vector2(1024, 1024), // should be window height
            sizeAttenuation: true,
            near: near,
            far: far,
            fog: true
        });
        // -- end mesh line
        
        const materialSplineDotted = new LineBasicMaterial({
            color: this.opts.lines.color,
            linewidth: 1,
            transparent: true,
            opacity: this.opts.lines.opacity
        });

        const update = () => {
            let nextSpot = pointList.shift();
            let nextSpot2 = pointList2.shift();
            const SPOT_NEXT_O = SPOT_NEXT - this.opts.lines.dotwiggle;

            for (let x = 0; x < this.geometrySpline.vertices.length; x++){

                let currentVert = this.geometrySpline.vertices[x];
                let currentPoint = mapPoint(nextSpot.lat, nextSpot.lon);

                let currentVert2 = this.geometrySplineDotted.vertices[x];
                let currentPoint2 = mapPoint(nextSpot2.lat, nextSpot2.lon);

                if (x >= nextSpot.index) {
                    currentVert.set(currentPoint.x * SPOT_NEXT, currentPoint.y * SPOT_NEXT, currentPoint.z * SPOT_NEXT);
                    currentVert2.set(currentPoint2.x * SPOT_NEXT_O, currentPoint2.y * SPOT_NEXT_O, currentPoint2.z * SPOT_NEXT_O);
                }
            }
            
            this.geometrySpline.verticesNeedUpdate = true;
            this.meshLine.setGeometry(this.geometrySpline, sizeFunction); // ned to reset it

            this.geometrySplineDotted.verticesNeedUpdate = true;

            if (pointList.length > 0){
                setTimeout(update, this.opts.lines.drawTime / this.opts.lines.segments);
            }
        };

        update();

        const trailMesh = new Mesh(this.meshLine.geometry, materialMeshSpline);
        trailMesh.frustumCulled = false;

        this.scene.add(trailMesh);

        if (this.opts.lines.dotwiggle !== 0) {
            this.scene.add(new LineSegments(this.geometrySplineDotted, materialSplineDotted));
        }
    }

    this.scene.add(this.marker);
    this.scene.add(this.labelSprite);
}

Marker.prototype.rescale = function(scale) {
    //todo: wrong when tweening, should cancel
    scale = attenuateScale(scale);
    if (this.marker.scale.x > 0) {
        // do this
        this.marker.scale.set(this.opts.marker.size / scale, this.opts.marker.size / scale);
    }
    this.labelSprite.scale.set(this.labelScale.x / scale, this.labelScale.y / scale);
}

Marker.prototype.remove = function() {
    let x = 0;

    const update = (ref) => {

        for (let i = 0; i < x; i++){
            ref.geometrySpline.vertices[i].set(ref.geometrySpline.vertices[i+1]);
            ref.geometrySplineDotted.vertices[i].set(ref.geometrySplineDotted.vertices[i+1]);
        }
        ref.geometrySpline.verticesNeedUpdate = true;
        ref.geometrySplineDotted.verticesNeedUpdate = true;
        x++;
        if (x < ref.geometrySpline.vertices.length) {
            setTimeout(() => update(ref), this.opts.lines.drawTime / this.opts.lines.segments);
        } else {
            this.scene.remove(ref.geometrySpline);
            this.scene.remove(ref.geometrySplineDotted);
        }
    }

    for (let j = 0; j < this.next.length; j++){
        (function(k){
            update(this.next[k]);
        })(j);
    } 

    this.scene.remove(this.marker);
    this.scene.remove(this.labelSprite);
};

export default Marker;