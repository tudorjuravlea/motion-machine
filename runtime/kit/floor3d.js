// floor3d: what lies on the 3D stage's floor, written for this kit. A soft contact shadow (the device
// seen from under the floor, as height above it, blurred twice: dark where it touches, a wide faint
// pool beyond) and a mirror (the Reflector port, with its own shader: the reflection fades with the
// distance from the device's footprint and softens as it goes). Both are drawn from the device's pose
// at t, so a frame depends on nothing before it.
import {
  Color, Mesh, MeshDepthMaterial, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry, CustomBlending,
  ShaderMaterial, Vector2, WebGLRenderTarget, HalfFloatType, LinearFilter,
} from '../vendor/three/0.170.0/three.module.min.js';
import { FullScreenQuad } from '../vendor/three/0.170.0/postprocessing/Pass.js';
import { Reflector } from '../vendor/three/0.170.0/objects/Reflector.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;

// a separable gaussian over a one-channel map: 9 taps a `step` apart (in uv), along `dir`
const BLUR = /* glsl */`
  uniform sampler2D tMap; uniform vec2 dir; uniform float step; varying vec2 vUv;
  void main() {
    float w[5] = float[5]( 0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162 );
    float s = texture2D( tMap, vUv ).r * w[0];
    for ( int i = 1; i < 5; i ++ ) {
      vec2 o = dir * step * float( i );
      s += ( texture2D( tMap, vUv + o ).r + texture2D( tMap, vUv - o ).r ) * w[i];
    }
    gl_FragColor = vec4( vec3( s ), 1.0 );
  }
`;

// the shadow's card: black, as opaque as the blurred height says, fading to nothing at its edge
const POOL = /* glsl */`
  uniform sampler2D tNear; uniform sampler2D tWide; uniform float strength; varying vec2 vUv;
  void main() {
    vec2 uv = vec2( 1.0 - vUv.x, vUv.y );
    float s = mix( texture2D( tNear, uv ).r, texture2D( tWide, uv ).r, 0.45 );
    vec2 e = smoothstep( 0.0, 0.14, vUv ) * smoothstep( 0.0, 0.14, 1.0 - vUv );
    gl_FragColor = vec4( vec3( 0.0 ), clamp( s * strength, 0.0, 1.0 ) * e.x * e.y );
  }
`;

const MIRROR_VERT = /* glsl */`
  uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
  void main() {
    vUv = textureMatrix * vec4( position, 1.0 );
    vWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

// the reflection: strongest at the footprint, gone by `reach`; a 16-tap spiral blur that widens with distance
const MIRROR_FRAG = /* glsl */`
  uniform vec3 color; uniform sampler2D tDiffuse; uniform vec2 centre; uniform float reach; uniform float strength; uniform float soft;
  varying vec4 vUv; varying vec3 vWorld;
  void main() {
    float d = smoothstep( 0.0, reach, length( vWorld.xz - centre ) );
    vec2 p = vUv.xy / vUv.w;
    float r = soft * ( 0.002 + 0.03 * d );
    vec4 sum = vec4( 0.0 );
    for ( int i = 0; i < 16; i ++ ) {
      float k = sqrt( ( float( i ) + 0.5 ) / 16.0 ), a = float( i ) * 2.399963229728653;
      sum += texture2D( tDiffuse, p + vec2( cos( a ), sin( a ) ) * k * r );
    }
    float fade = 1.0 - d;
    gl_FragColor = ( sum / 16.0 ) * fade * fade * strength;
  }
`;

// The contact shadow. size: how far the pool reaches across the floor (world units); height: how
// far above the floor the device reaches (what the depth fades over).
export function contactShadow({ size, height }) {
  const rt = (depth) => new WebGLRenderTarget(256, 256, { type: HalfFloatType, depthBuffer: depth, minFilter: LinearFilter, magFilter: LinearFilter });
  const targets = { depth: rt(true), a: rt(false), b: rt(false), near: rt(false), wide: rt(false) };
  const LOWER = 0.02;   // the camera sits a hair under the floor, so a part resting on it still reads as nearly nothing away
  const cam = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height + LOWER);
  const depthMat = new MeshDepthMaterial();
  const blur = new ShaderMaterial({ uniforms: { tMap: { value: null }, dir: { value: new Vector2(1, 0) }, step: { value: 0.01 } }, vertexShader: VERT, fragmentShader: BLUR });
  const quad = new FullScreenQuad(blur);
  const pool = new Mesh(new PlaneGeometry(size, size), new ShaderMaterial({
    uniforms: { tNear: { value: targets.near.texture }, tWide: { value: targets.wide.texture }, strength: { value: 1 } },
    vertexShader: VERT, fragmentShader: POOL, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 2;
  pool.userData.noDepth = true;
  const pass = (from, to, dir, step) => {
    blur.uniforms.tMap.value = from.texture; blur.uniforms.dir.value.copy(dir); blur.uniforms.step.value = step;
    return to;
  };
  return {
    mesh: pool,
    // renders the device's height above the floor from beneath it and blurs it into the pool
    // (scene, renderer: the stage's; at: the floor point under the device; floorY: the floor's height)
    update(renderer, scene, at, floorY, strength, soft) {
      pool.visible = false;
      cam.position.set(at.x, floorY - LOWER, at.z);
      cam.up.set(0, 0, -1);
      cam.lookAt(at.x, floorY + 1, at.z);
      cam.updateMatrixWorld();
      const hidden = [];
      scene.traverse((o) => { if (o !== scene && (o.userData.noDepth || o.userData.catcher) && o.visible) { o.visible = false; hidden.push(o); } });
      const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), colour = renderer.getClearColor(new Color());
      renderer.setClearColor(0x000000, 0);
      scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(targets.depth);
      renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      for (const o of hidden) o.visible = true;
      // two widths: tight where it touches, broad beyond
      const s = soft * 0.012;
      quad.material = blur;
      renderer.setRenderTarget(pass(targets.depth, targets.a, new Vector2(1, 0), s * 0.5)); quad.render(renderer);
      renderer.setRenderTarget(pass(targets.a, targets.near, new Vector2(0, 1), s * 0.5)); quad.render(renderer);
      renderer.setRenderTarget(pass(targets.near, targets.b, new Vector2(1, 0), s * 2.2)); quad.render(renderer);
      renderer.setRenderTarget(pass(targets.b, targets.wide, new Vector2(0, 1), s * 2.2)); quad.render(renderer);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(colour, alpha);
      pool.visible = strength > 0;
      pool.position.set(at.x, floorY + 0.0006, at.z);
      pool.material.uniforms.strength.value = strength;
    },
    dispose() { for (const t of Object.values(targets)) t.dispose(); depthMat.dispose(); blur.dispose(); pool.geometry.dispose(); pool.material.dispose(); },
  };
}

// The mirror floor: size across, a reflection texture of (w x h). Its params (strength, soft, centre,
// reach) are set by the stage each frame.
export function mirrorFloor({ size, w, h }) {
  const geometry = new PlaneGeometry(size, size);
  const mirror = new Reflector(geometry, {
    textureWidth: w, textureHeight: h, multisample: 0,
    shader: {
      name: 'MirrorFloor',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, centre: { value: new Vector2() }, reach: { value: 2 }, strength: { value: 0 }, soft: { value: 0.5 } },
      vertexShader: MIRROR_VERT,
      fragmentShader: MIRROR_FRAG,
      material: { transparent: true, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor },
    },
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.renderOrder = 1;
  mirror.userData.noDepth = true;
  return mirror;
}
