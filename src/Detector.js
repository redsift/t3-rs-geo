/* Original based on code from THREE.js 
 *
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

export function supportsWebGL() {
    try {
        const canvas = document.createElement( 'canvas' ); return !! ( window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ) );
    } 
    catch (e) {
        return false;
    }
}

export function browserSupportsWebGL() {
    return window.WebGLRenderingContext ? true : false;
}
