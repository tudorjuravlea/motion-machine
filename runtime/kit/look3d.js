// look3d: the studio look of the 3D devices, written for this kit around the ported three.js passes. The
// stage renders into a linear half-float target and an output pass writes the canvas (sRGB), so every
// effect works on light as it is: supersampled edges (the scene rendered several times, shifted by
// sixteenths of a pixel), a glow from the screen's own picture, ambient occlusion, depth of field, a soft
// contact shadow and a mirror floor. Each is a pattern param a brand sets once (style.patterns), and
// every one is a pure function of the pose at t: a fixed jitter table, a seeded noise texture, a focus
// computed from the camera and the device, nothing that reads a clock or the frame before.
import {
  Color, HalfFloatType, MeshBasicMaterial, MeshNormalMaterial, NearestFilter, NoBlending, DepthTexture, DepthStencilFormat,
  UnsignedInt248Type, Vector2, Vector3, WebGLRenderTarget,
} from '../vendor/three/0.170.0/three.module.min.js';
import { Pass } from '../vendor/three/0.170.0/postprocessing/Pass.js';
import { EffectComposer } from '../vendor/three/0.170.0/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/0.170.0/postprocessing/RenderPass.js';
import { SSAARenderPass } from '../vendor/three/0.170.0/postprocessing/SSAARenderPass.js';
import { UnrealBloomPass } from '../vendor/three/0.170.0/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from '../vendor/three/0.170.0/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/three/0.170.0/postprocessing/OutputPass.js';
import { DofPass } from './dof3d.js';
import { contactShadow, mirrorFloor } from './floor3d.js';
import { random } from './random.js';

// The params of the look, shared by 3d/phone and 3d/laptop. A brand sets any of them for every use with
// style.patterns["3d/phone"] = { aa: "ssaa16" } (the kit reads the pattern default, then the brand's, then the beat's).
export const LOOK_PARAMS = {
  aa: { type: 'enum(auto|ssaa4|ssaa16|msaa|off)', default: 'auto', meaning: 'edge anti-aliasing: ssaa4 and ssaa16 render the frame 4 or 16 times shifted by sixteenths of a pixel and average them (exact, the same on every machine; 16 costs four times as much); msaa is the graphics card\'s own multisampling (fast, driver-dependent); off leaves the edges stepped; auto is ssaa4 in an export and a check, msaa in a preview' },
  glow: { type: 'number', default: 0.4, meaning: 'the screen\'s glow, 0 to 1: the bright parts of the screen\'s picture bloom softly onto the bezel and the air around it (0 is off)' },
  contact: { type: 'number', default: 0, meaning: 'a contact shadow right under the device, 0 to 1 (0 is off, the default: the soft long shadow of the key light is the only one): dark where the device is close to the floor, a wide faint pool beyond' },
  contactSoft: { type: 'number', default: 0.5, meaning: 'how far the contact shadow spreads, 0 (tight) to 1 (wide)' },
  occlusion: { type: 'number', default: 0, meaning: 'ambient occlusion, 0 to 1 (0 is off): the creases of the device (a hinge, a key, a lens ring) take a little shade' },
  reflection: { type: 'number', default: 0, meaning: 'a mirror floor, 0 to 1 (0 is off): the device reflected in the floor, strongest at its foot and fading away from it' },
  reflectSoft: { type: 'number', default: 0.5, meaning: 'how soft the floor\'s reflection is, 0 (a mirror) to 1 (a polished table)' },
  studio: { type: 'enum(light|dark|brand)', default: 'light', meaning: 'the light the device is lit by: light is a white void with softboxes (for a light ground); dark is a dark room with softbox strips; brand is the same void tinted by the brand\'s canvas role, with the accent role as a rim' },
  dof: { type: 'number', default: 0, meaning: 'depth of field, 0 to 1 (0 is off): what lies nearer or further than the device is blurred, the focus set from the camera to the device at that instant' },
  tilt: { type: 'number', default: 0, meaning: 'a tilt-shift blur, 0 to 1 (0 is off): the frame softens toward its top and bottom edges, the device\'s row staying sharp' },
  brushed: { type: 'number', default: 0.35, meaning: 'the brushed grain of the metal, 0 (smooth satin) to 1 (a strong streak along the grain)' },
};

// what a render counts as: an export, a stills run and a gate check open the page in render mode
const AUTO_RENDER = 'ssaa4', AUTO_PREVIEW = 'msaa';

const clamp01 = (v, d) => { const x = Number(v ?? d); return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d; };

/** The params, read into a plain config: numbers clamped to 0..1, enums checked, `auto` resolved for the mode. */
export function lookOf(params = {}, render = false) {
  const aaWanted = String(params.aa ?? 'auto');
  const aa = aaWanted === 'auto' ? (render ? AUTO_RENDER : AUTO_PREVIEW) : ['ssaa4', 'ssaa16', 'msaa', 'off'].includes(aaWanted) ? aaWanted : AUTO_RENDER;
  const studio = ['light', 'dark', 'brand'].includes(params.studio) ? params.studio : 'light';
  return {
    aa, studio,
    glow: clamp01(params.glow, LOOK_PARAMS.glow.default), contact: clamp01(params.contact, 0), soft: clamp01(params.contactSoft, 0.5),
    occlusion: clamp01(params.occlusion, LOOK_PARAMS.occlusion.default), reflection: clamp01(params.reflection, 0), reflectSoft: clamp01(params.reflectSoft, 0.5),
    dof: clamp01(params.dof, 0), tilt: clamp01(params.tilt, 0), brushed: clamp01(params.brushed, LOOK_PARAMS.brushed.default),
  };
}

// Tone mapping lives in the materials (as the renderer does it when it draws to the screen), so the
// emissive screen stays exempt from it and shows its picture exactly. This is three.js's Neutral
// mapping (the Khronos PBR Neutral curve, three r187's NeutralToneMapping), at exposure 1.
const NEUTRAL = /* glsl */`
vec3 mmNeutral( vec3 color ) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}
`;
/** Gives a material the Neutral tone mapping inside its own shader (a material with toneMapped false is left as it is). */
export function toneMapped(material) {
  if (material.toneMapped === false || material.userData.neutral) return material;
  material.userData.neutral = true;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.fragmentShader = NEUTRAL + shader.fragmentShader.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = mmNeutral( gl_FragColor.rgb );');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `mm-neutral ${key ? key() : ''}`;
  material.needsUpdate = true;
  return material;
}

// renders the scene's normals and depth, once a frame, for the occlusion and the depth of field
class GBufferPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false;
    const depth = new DepthTexture(1, 1);
    depth.format = DepthStencilFormat;
    depth.type = UnsignedInt248Type;
    this.target = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, type: HalfFloatType, depthTexture: depth });
    this.material = new MeshNormalMaterial();
    this.material.blending = NoBlending;
    this.colour = new Color();
  }
  setSize(w, h) { this.target.setSize(w, h); }
  render(renderer) {
    const hidden = [];
    this.scene.traverse((o) => { if (o.visible && (o.userData.noDepth || o.isPoints || o.isLine)) { o.visible = false; hidden.push(o); } });
    const autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.colour);
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x7777ff, 1);   // a flat normal pointing at the camera, as the GTAO pass clears it
    renderer.clear();
    this.scene.overrideMaterial = this.material;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    renderer.setClearColor(this.colour, alpha);
    renderer.autoClear = autoClear;
    for (const o of hidden) o.visible = true;
  }
}

/**
 * The look of one stage: owns the composer and the passes, and draws a frame. `c` is the stage object
 * (renderer, scene, camera, floor, glow ...); `body` is the device group, `focus` a point of it in its own
 * coordinates, `floorY` the floor's height, `reach` how far the contact pool and the mirror run
 * from the device and `height` how tall the device is above the floor.
 */
export class Look {
  constructor(c, { body, focus = new Vector3(), reach, height }) {
    this.c = c; this.body = body; this.focus = focus; this.reach = reach; this.height = height;
    this.cfg = null; this.key = '';
    this.size = new Vector2(2, 2);
    this.contact = contactShadow({ size: reach * 2.2, height: height * 1.15 });
    this.mirror = mirrorFloor({ size: 14, w: 512, h: 512 });
    c.scene.add(this.contact.mesh, this.mirror);
    this.mirror.hide = [c.glow, c.floor, this.contact.mesh];
    this.glowTarget = new WebGLRenderTarget(2, 2, { type: HalfFloatType });
    this.black = new MeshBasicMaterial({ colorWrite: false });   // hides what lies behind it from the glow source, and draws nothing itself
    this.picture = new MeshBasicMaterial({ map: c.tex, toneMapped: false });
    this.noise = random(0x6d6d3361);   // the occlusion's noise texture: the same table on every load
    this.tmp = new Vector3();
  }

  /** Sets up (or changes) the chain for a config; a config the chain already has is left alone. */
  configure(cfg) {
    const key = JSON.stringify([cfg.aa, cfg.glow > 0, cfg.occlusion > 0, cfg.dof > 0 || cfg.tilt > 0]);
    this.cfg = cfg;
    if (key === this.key) return;
    this.key = key;
    const { renderer, scene, camera } = this.c;
    this.composer?.dispose();
    const msaa = cfg.aa === 'msaa';
    const target = new WebGLRenderTarget(this.size.x, this.size.y, { type: HalfFloatType, samples: msaa ? 4 : 0 });
    const composer = this.composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(1);
    this.ssaa = null;
    if (cfg.aa === 'ssaa4' || cfg.aa === 'ssaa16') {
      this.ssaa = new SSAARenderPass(scene, camera, 0x000000, 0);
      this.ssaa.sampleLevel = cfg.aa === 'ssaa16' ? 4 : 2;
      this.ssaa.onSample = (i) => { this.mirror.frozen = i > 0; };
      composer.addPass(this.ssaa);
    } else composer.addPass(new RenderPass(scene, camera, null, 0x000000, 0));
    this.gbuffer = this.gtao = this.dofPass = this.bloom = null;
    if (cfg.occlusion > 0 || cfg.dof > 0 || cfg.tilt > 0) { this.gbuffer = new GBufferPass(scene, camera); composer.addPass(this.gbuffer); }
    if (cfg.occlusion > 0) {
      this.gtao = new GTAOPass(scene, camera, 2, 2, { random: this.noise, depthTexture: this.gbuffer.target.depthTexture, normalTexture: this.gbuffer.target.texture },
        { radius: 0.3, distanceExponent: 1.5, thickness: 0.6, scale: 1.4, samples: 16 });
      composer.addPass(this.gtao);
    }
    if (cfg.dof > 0 || cfg.tilt > 0) { this.dofPass = new DofPass(camera); this.dofPass.depth = this.gbuffer.target.depthTexture; composer.addPass(this.dofPass); }
    if (cfg.glow > 0) {
      this.bloom = new UnrealBloomPass(new Vector2(this.size.x, this.size.y), 0.3, 0.55, 0.62);
      this.bloom.input = this.glowTarget;
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.applySize();
  }

  setSize(w, h) {
    if (this.size.x === w && this.size.y === h) return;
    this.size.set(w, h);
    this.applySize();
  }

  applySize() {
    const { x: w, y: h } = this.size;
    this.composer?.setSize(w, h);
    this.gtao?.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));   // the occlusion at half the resolution
    this.glowTarget.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.mirror.getRenderTarget().setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  // the screen's picture alone, with everything else black, for the glow to be taken from
  renderGlowSource() {
    const { renderer, scene, camera } = this.c;
    const swapped = [], hidden = [];
    scene.traverse((o) => {
      if (o.userData.noDepth || o.userData.catcher) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
      if (!o.isMesh) return;
      swapped.push([o, o.material]);
      o.material = [o.material].flat().some((m) => m.userData.glowSource) ? this.picture : this.black;
    });
    const alpha = renderer.getClearAlpha(), colour = renderer.getClearColor(new Color());
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.glowTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setClearColor(colour, alpha);
    for (const [o, m] of swapped) o.material = m;
    for (const o of hidden) o.visible = true;
  }

  /** Draws the frame for the pose the stage is in: every pass reads that pose and nothing else. */
  render() {
    const { renderer, scene, camera, floor } = this.c;
    const cfg = this.cfg;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    // the floor under the device, and what is drawn on it
    const at = this.tmp.copy(this.body.position);
    if (cfg.contact > 0) this.contact.update(renderer, scene, at, floor.position.y, cfg.contact, cfg.soft);
    else this.contact.mesh.visible = false;
    this.mirror.visible = cfg.reflection > 0;
    if (cfg.reflection > 0) {
      const u = this.mirror.material.uniforms;
      this.mirror.position.set(0, floor.position.y + 0.0003, 0);
      u.centre.value.set(at.x, at.z); u.reach.value = this.reach * 1.2; u.strength.value = cfg.reflection; u.soft.value = 0.15 + 1.2 * cfg.reflectSoft;
    }
    floor.material.opacity = (floor.userData.cast ?? 0.28) * (1 - 0.6 * cfg.contact);   // the key light's shadow gives way to the contact shadow
    if (this.bloom) {
      this.bloom.strength = 0.01 + 0.05 * cfg.glow;
      this.renderGlowSource();
    }
    if (this.dofPass) {
      const d = this.focus.clone();
      this.body.localToWorld(d);
      d.applyMatrix4(camera.matrixWorldInverse);
      const u = this.dofPass.uniforms;
      u.focus.value = -d.z;                       // the sharp plane is where the device is, at this instant
      u.aperture.value = 0.07 * cfg.dof;
      u.maxBlur.value = 0.004 + 0.016 * Math.max(cfg.dof, cfg.tilt);
      u.tilt.value = cfg.tilt;
      u.tiltAt.value = 0.5;
    }
    if (this.gtao) this.gtao.blendIntensity = cfg.occlusion;
    renderer.shadowMap.autoUpdate = false;      // the shadow map is drawn once for the frame, not once a sample
    renderer.shadowMap.needsUpdate = true;
    this.mirror.frozen = false;
    this.composer.render(0);
    renderer.shadowMap.needsUpdate = false;
  }
}
