# t3-rs-geo

[![Circle CI](https://img.shields.io/circleci/project/redsift/t3-rs-geo.svg?style=flat-square)](https://circleci.com/gh/redsift/t3-rs-geo)
[![npm](https://img.shields.io/npm/v/@redsift/t3-rs-geo.svg?style=flat-square)](https://www.npmjs.com/package/@redsift/t3-rs-geo)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://raw.githubusercontent.com/redsift/t3-rs-geo/master/LICENSE)

`t3-rs-geo` is stylized, WebGL data driven globe.

## Screenshot

![t3-rs-geo](https://raw.github.com/redsift/t3-rs-geo/master/examples/screenshot.jpg "T3 Globe")

## Example Usage

```javascript
<script src="/t3-rs-geo.umd-es2015.min.js"></script>
<script>
    var globe = new t3_rs_geo.Globe(window.innerWidth, window.innerHeight, { tiles: t3_rs_geo.GRID_LQ });
    document.getElementById('elm').appendChild(globe.domElement);

    globe.ready.then(() => {
        (function tick() {
            globe.tick();
            requestAnimationFrame(tick);
        })();
    });
</script>
```

[View the @redsift/t3-rs-geo 101 on Codepen](http://codepen.io/rahulpowar/pen/zNRrEL)

[Interactive, High Quality example on Codepen](http://codepen.io/rahulpowar/pen/zNRrEL)

## History

This globe started out as a fork of Robert Scanlon's [encom-globe](https://github.com/arscan/encom-globe). It was converted to a standalone project as the API and direction of the component departed from the objectives of the original. Significant changes include an update to the current (Jan 2017) version of THREE.js, exposing mostly everything for customization, a rewrite as an ES6 module, use of mesh lines and [SDF](https://www.youtube.com/watch?v=CGZRHJvJYIg) rendering among other changes.

## Usage

...

## Generating tiles

The globe requires vertex data to render the globe and the various land masses. The precompiled bundle includes a row resolution hex grid as part of the `t3_rs_geo` object. Higher quality JSON files are also provided and can be loaded on demand. The companion repository [t3-rs-geo-tiles](https://github.com/redsift/t3-rs-geo-tiles) generates these tiles and can be used to tweak the grid and the mappings.

## Works on

Chrome 56

## TODO

1. Merge scale indicator
1. CI

1. Hit testing and callback
1. Fog scaling
1. Higher res con trails
1. Noise in trail
1. Normalise speed 
1. Path direction
1. Programmatic panning and animated transitions
1. Animate base color 
1. Make wiggle a scale function 
1. HDR function
1. Align API
1. Atmosphere shader
1. Ocean shader
1. Docs / examples

## Attribution

This software is substantially based on [encom-globe](https://github.com/arscan/encom-globe) by Robert Scanlon, licensed under MIT.

The MIT License (MIT)
Copyright (c) 2014 Robert Scanlon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
