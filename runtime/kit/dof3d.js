// dof3d: depth of field for the 3D stage, written for this kit. A pass that blurs each pixel by its
// circle of confusion: from how far its depth lies from the focus distance (a lens), and/or from how
// far its row lies from a focus band (a tilt-shift). The focus is set by the caller from the camera
// to the device at t, never found by looking at the picture, and the tap pattern is fixed (a golden-angle
// spiral, no noise), so the blur is a pure function of the frame and its depth.
import { ShaderMaterial, Vector2 } from '../vendor/three/0.170.0/three.module.min.js';
import { Pass, FullScreenQuad } from '../vendor/three/0.170.0/postprocessing/Pass.js';

const TAPS = 32;   // the spiral's taps; the golden angle spreads them evenly over the disc
const GOLDEN = 2.399963229728653;

// coc: the circle of confusion as a fraction of the frame's height. The colour is premultiplied
// (the canvas is transparent), so averaging taps averages colour and coverage alike.
const FRAGMENT = /* glsl */`
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform float focus;      // view distance of the sharp plane
  uniform float aperture;   // blur per unit of relative defocus, a fraction of the frame height
  uniform float maxBlur;    // the largest circle, a fraction of the frame height
  uniform float tilt;       // 0..1: the tilt-shift's blur at the frame edge
  uniform float tiltAt;     // the row (0 bottom, 1 top) that stays sharp
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float aspect;     // frame width over height
  varying vec2 vUv;

  float circle( vec2 uv ) {
    float d = texture2D( tDepth, uv ).x;
    float z = d >= 1.0 ? cameraFar : -perspectiveDepthToViewZ( d, cameraNear, cameraFar );
    float lens = aperture * abs( z - focus ) / max( z, 0.001 );
    float band = tilt * maxBlur * pow( clamp( abs( uv.y - tiltAt ) * 2.0, 0.0, 1.0 ), 1.5 );
    return min( max( lens, band ), maxBlur );
  }

  void main() {
    float coc = circle( vUv );
    vec4 here = texture2D( tDiffuse, vUv );
    if ( coc < 0.0005 ) { gl_FragColor = here; return; }
    vec4 sum = here;
    float weight = 1.0;
    for ( int i = 0; i < ${TAPS}; i ++ ) {
      float r = sqrt( ( float( i ) + 0.5 ) / float( ${TAPS} ) );
      float a = float( i ) * ${GOLDEN};
      vec2 o = vec2( cos( a ), sin( a ) ) * r * coc;
      vec2 uv = vUv + vec2( o.x / aspect, o.y );
      // a neighbour sharper than the distance to it does not smear into this pixel (no halo round a focused edge)
      float w = clamp( circle( uv ) / max( r * coc, 0.0001 ), 0.0, 1.0 );
      sum += texture2D( tDiffuse, uv ) * w;
      weight += w;
    }
    gl_FragColor = sum / weight;
  }
`;

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

export class DofPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.depth = null;        // the depth texture to read, set by the caller each frame
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, focus: { value: 5 }, aperture: { value: 0 }, maxBlur: { value: 0.03 },
        tilt: { value: 0 }, tiltAt: { value: 0.5 }, cameraNear: { value: 1 }, cameraFar: { value: 100 }, aspect: { value: 1 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.uniforms = this.material.uniforms;
    this.size = new Vector2(1, 1);
    this._quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) { this.size.set(w, h); this.uniforms.aspect.value = w / Math.max(1, h); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.depth;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
  }

  dispose() { this.material.dispose(); this._quad.dispose(); }
}
