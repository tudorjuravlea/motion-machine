// Ported from three.js r187 examples/jsm/postprocessing/GTAOPass.js (MIT, Copyright 2010-2026
// three.js authors; see ../LICENSE and the repository NOTICE), adapted to the vendored 0.170.0
// core. The `three` import is rewritten to it and the doc comments are shortened. Two changes keep
// a frame a pure function of t: the Poisson-denoise noise texture is built from a seeded random
// source passed in as `parameters.random` (an object with a random() method; upstream defaults to
// the platform's), and the G-buffer pass hides, besides points and lines, every object marked
// `userData.noDepth` (a glow card, a sheen plane, a shadow catcher: surfaces that are not geometry).
import {
	AddEquation,
	Color,
	CustomBlending,
	DataTexture,
	DepthTexture,
	DepthStencilFormat,
	DstAlphaFactor,
	DstColorFactor,
	HalfFloatType,
	MeshNormalMaterial,
	NearestFilter,
	NoBlending,
	RepeatWrapping,
	RGBAFormat,
	ShaderMaterial,
	UniformsUtils,
	UnsignedByteType,
	UnsignedInt248Type,
	WebGLRenderTarget,
	ZeroFactor
} from '../three.module.min.js';
import { Pass, FullScreenQuad } from './Pass.js';
import { generateMagicSquareNoise, GTAOShader, GTAODepthShader, GTAOBlendShader } from '../shaders/GTAOShader.js';
import { generatePdSamplePointInitializer, PoissonDenoiseShader } from '../shaders/PoissonDenoiseShader.js';
import { CopyShader } from '../shaders/CopyShader.js';
import { SimplexNoise } from '../math/SimplexNoise.js';

// A pass for a GTAO (ground-truth ambient occlusion) effect; better than SSAO and more expensive.
class GTAOPass extends Pass {

	constructor( scene, camera, width = 512, height = 512, parameters, aoParameters, pdParameters ) {

		super();

		this.width = width;

		this.height = height;

		this.clear = true;

		this.camera = camera;

		this.scene = scene;

		this.output = 0;
		this._renderGBuffer = true;
		this._visibilityCache = [];

		this.blendIntensity = 1.;

		this.pdRings = 2.;

		this.pdRadiusExponent = 2.;

		this.pdSamples = 16;

		this.gtaoNoiseTexture = generateMagicSquareNoise();
		this.pdNoiseTexture = this._generateNoise( 64, parameters.random );

		this.gtaoRenderTarget = new WebGLRenderTarget( this.width, this.height, { type: HalfFloatType, depthBuffer: false } );
		this.pdRenderTarget = this.gtaoRenderTarget.clone();

		this.gtaoMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, GTAOShader.defines ),
			uniforms: UniformsUtils.clone( GTAOShader.uniforms ),
			vertexShader: GTAOShader.vertexShader,
			fragmentShader: GTAOShader.fragmentShader,
			blending: NoBlending,
			depthTest: false,
			depthWrite: false,
		} );
		this.gtaoMaterial.defines.PERSPECTIVE_CAMERA = this.camera.isPerspectiveCamera ? 1 : 0;
		this.gtaoMaterial.uniforms.tNoise.value = this.gtaoNoiseTexture;
		this.gtaoMaterial.uniforms.resolution.value.set( this.width, this.height );
		this.gtaoMaterial.uniforms.cameraNear.value = this.camera.near;
		this.gtaoMaterial.uniforms.cameraFar.value = this.camera.far;

		this.normalMaterial = new MeshNormalMaterial();
		this.normalMaterial.blending = NoBlending;

		this.pdMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, PoissonDenoiseShader.defines ),
			uniforms: UniformsUtils.clone( PoissonDenoiseShader.uniforms ),
			vertexShader: PoissonDenoiseShader.vertexShader,
			fragmentShader: PoissonDenoiseShader.fragmentShader,
			depthTest: false,
			depthWrite: false,
		} );
		this.pdMaterial.uniforms.tDiffuse.value = this.gtaoRenderTarget.texture;
		this.pdMaterial.uniforms.tNoise.value = this.pdNoiseTexture;
		this.pdMaterial.uniforms.resolution.value.set( this.width, this.height );
		this.pdMaterial.uniforms.lumaPhi.value = 10;
		this.pdMaterial.uniforms.depthPhi.value = 2;
		this.pdMaterial.uniforms.normalPhi.value = 3;
		this.pdMaterial.uniforms.radius.value = 8;

		this.depthRenderMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, GTAODepthShader.defines ),
			uniforms: UniformsUtils.clone( GTAODepthShader.uniforms ),
			vertexShader: GTAODepthShader.vertexShader,
			fragmentShader: GTAODepthShader.fragmentShader,
			blending: NoBlending
		} );
		this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near;
		this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far;

		this.copyMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blendSrc: DstColorFactor,
			blendDst: ZeroFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: DstAlphaFactor,
			blendDstAlpha: ZeroFactor,
			blendEquationAlpha: AddEquation
		} );

		this.blendMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( GTAOBlendShader.uniforms ),
			vertexShader: GTAOBlendShader.vertexShader,
			fragmentShader: GTAOBlendShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: CustomBlending,
			blendSrc: DstColorFactor,
			blendDst: ZeroFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: DstAlphaFactor,
			blendDstAlpha: ZeroFactor,
			blendEquationAlpha: AddEquation
		} );

		this._fsQuad = new FullScreenQuad( null );

		this._originalClearColor = new Color();

		this.setGBuffer( parameters ? parameters.depthTexture : undefined, parameters ? parameters.normalTexture : undefined );

		if ( aoParameters !== undefined ) {

			this.updateGtaoMaterial( aoParameters );

		}

		if ( pdParameters !== undefined ) {

			this.updatePdMaterial( pdParameters );

		}

	}

	setSize( width, height ) {

		this.width = width;
		this.height = height;

		this.gtaoRenderTarget.setSize( width, height );
		if ( this.normalRenderTarget ) this.normalRenderTarget.setSize( width, height );
		this.pdRenderTarget.setSize( width, height );

		this.gtaoMaterial.uniforms.resolution.value.set( width, height );
		this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy( this.camera.projectionMatrix );
		this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy( this.camera.projectionMatrixInverse );

		this.pdMaterial.uniforms.resolution.value.set( width, height );
		this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy( this.camera.projectionMatrixInverse );

	}

	dispose() {

		this.gtaoNoiseTexture.dispose();
		this.pdNoiseTexture.dispose();
		if ( this.normalRenderTarget ) this.normalRenderTarget.dispose();
		this.gtaoRenderTarget.dispose();
		this.pdRenderTarget.dispose();
		this.normalMaterial.dispose();
		this.pdMaterial.dispose();
		this.copyMaterial.dispose();
		this.depthRenderMaterial.dispose();
		this._fsQuad.dispose();

	}

	// a texture holding the computed AO
	get gtaoMap() {

		return this.pdRenderTarget.texture;

	}

	// Configures the G-buffer of this pass. Without arguments the pass creates an internal render
	// target holding depth and normal data; external data must use separate textures and stay owned
	// by the caller. Without a normal texture, normals are reconstructed from depth.
	setGBuffer( depthTexture, normalTexture ) {

		if ( depthTexture !== undefined ) {

			this.depthTexture = depthTexture;
			this.normalTexture = normalTexture;
			this._renderGBuffer = false;

		} else {

			if ( this.normalRenderTarget === undefined ) {

				const depthTexture = new DepthTexture();
				depthTexture.format = DepthStencilFormat;
				depthTexture.type = UnsignedInt248Type;
				this.normalRenderTarget = new WebGLRenderTarget( this.width, this.height, {
					minFilter: NearestFilter,
					magFilter: NearestFilter,
					type: HalfFloatType,
					depthTexture: depthTexture
				} );

			}

			this.depthTexture = this.normalRenderTarget.depthTexture;
			this.normalTexture = this.normalRenderTarget.texture;
			this._renderGBuffer = true;

		}

		const normalVectorType = ( this.normalTexture ) ? 1 : 0;

		this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE = normalVectorType;
		this.gtaoMaterial.needsUpdate = true;
		this.gtaoMaterial.uniforms.tNormal.value = this.normalTexture;
		this.gtaoMaterial.uniforms.tDepth.value = this.depthTexture;

		this.pdMaterial.defines.NORMAL_VECTOR_TYPE = normalVectorType;
		this.pdMaterial.needsUpdate = true;
		this.pdMaterial.uniforms.tNormal.value = this.normalTexture;
		this.pdMaterial.uniforms.tDepth.value = this.depthTexture;

		this.depthRenderMaterial.uniforms.tDepth.value = this.depthTexture;

	}

	// Limits the GTAO to the given AABB (null: no clip box).
	setSceneClipBox( box ) {

		if ( box ) {

			this.gtaoMaterial.needsUpdate = this.gtaoMaterial.defines.SCENE_CLIP_BOX !== 1;
			this.gtaoMaterial.defines.SCENE_CLIP_BOX = 1;
			this.gtaoMaterial.uniforms.sceneBoxMin.value.copy( box.min );
			this.gtaoMaterial.uniforms.sceneBoxMax.value.copy( box.max );

		} else {

			this.gtaoMaterial.needsUpdate = this.gtaoMaterial.defines.SCENE_CLIP_BOX === 0;
			this.gtaoMaterial.defines.SCENE_CLIP_BOX = 0;

		}

	}

	updateGtaoMaterial( parameters ) {

		if ( parameters.radius !== undefined ) {

			this.gtaoMaterial.uniforms.radius.value = parameters.radius;

		}

		if ( parameters.distanceExponent !== undefined ) {

			this.gtaoMaterial.uniforms.distanceExponent.value = parameters.distanceExponent;

		}

		if ( parameters.thickness !== undefined ) {

			this.gtaoMaterial.uniforms.thickness.value = parameters.thickness;

		}

		if ( parameters.distanceFallOff !== undefined ) {

			this.gtaoMaterial.uniforms.distanceFallOff.value = parameters.distanceFallOff;
			this.gtaoMaterial.needsUpdate = true;

		}

		if ( parameters.scale !== undefined ) {

			this.gtaoMaterial.uniforms.scale.value = parameters.scale;

		}

		if ( parameters.samples !== undefined && parameters.samples !== this.gtaoMaterial.defines.SAMPLES ) {

			this.gtaoMaterial.defines.SAMPLES = parameters.samples;
			this.gtaoMaterial.needsUpdate = true;

		}

		if ( parameters.screenSpaceRadius !== undefined && ( parameters.screenSpaceRadius ? 1 : 0 ) !== this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS ) {

			this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS = parameters.screenSpaceRadius ? 1 : 0;
			this.gtaoMaterial.needsUpdate = true;

		}

	}

	updatePdMaterial( parameters ) {

		let updateShader = false;

		if ( parameters.lumaPhi !== undefined ) {

			this.pdMaterial.uniforms.lumaPhi.value = parameters.lumaPhi;

		}

		if ( parameters.depthPhi !== undefined ) {

			this.pdMaterial.uniforms.depthPhi.value = parameters.depthPhi;

		}

		if ( parameters.normalPhi !== undefined ) {

			this.pdMaterial.uniforms.normalPhi.value = parameters.normalPhi;

		}

		if ( parameters.radius !== undefined && parameters.radius !== this.radius ) {

			this.pdMaterial.uniforms.radius.value = parameters.radius;

		}

		if ( parameters.radiusExponent !== undefined && parameters.radiusExponent !== this.pdRadiusExponent ) {

			this.pdRadiusExponent = parameters.radiusExponent;
			updateShader = true;

		}

		if ( parameters.rings !== undefined && parameters.rings !== this.pdRings ) {

			this.pdRings = parameters.rings;
			updateShader = true;

		}

		if ( parameters.samples !== undefined && parameters.samples !== this.pdSamples ) {

			this.pdSamples = parameters.samples;
			updateShader = true;

		}

		if ( updateShader ) {

			this.pdMaterial.defines.SAMPLES = this.pdSamples;
			this.pdMaterial.defines.SAMPLE_VECTORS = generatePdSamplePointInitializer( this.pdSamples, this.pdRings, this.pdRadiusExponent );
			this.pdMaterial.needsUpdate = true;

		}

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		// render normals and depth (honor only meshes, points and lines do not contribute to AO)

		if ( this._renderGBuffer ) {

			this._overrideVisibility();
			this._renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
			this._restoreVisibility();

		}

		// render AO

		this.gtaoMaterial.uniforms.cameraNear.value = this.camera.near;
		this.gtaoMaterial.uniforms.cameraFar.value = this.camera.far;
		this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy( this.camera.projectionMatrix );
		this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy( this.camera.projectionMatrixInverse );
		this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy( this.camera.matrixWorld );
		this._renderPass( renderer, this.gtaoMaterial, this.gtaoRenderTarget, 0xffffff, 1.0 );

		// render poisson denoise

		this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy( this.camera.projectionMatrixInverse );
		this._renderPass( renderer, this.pdMaterial, this.pdRenderTarget, 0xffffff, 1.0 );

		// output result to screen

		switch ( this.output ) {

			case GTAOPass.OUTPUT.Off:
				break;

			case GTAOPass.OUTPUT.Diffuse:

				this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case GTAOPass.OUTPUT.AO:

				this.copyMaterial.uniforms.tDiffuse.value = this.gtaoRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case GTAOPass.OUTPUT.Denoise:

				this.copyMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case GTAOPass.OUTPUT.Depth:

				this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near;
				this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far;
				this._renderPass( renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case GTAOPass.OUTPUT.Normal:

				this.copyMaterial.uniforms.tDiffuse.value = this.normalTexture || null;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case GTAOPass.OUTPUT.Default:

				this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
				this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
				this._renderPass( renderer, this.blendMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			default:
				console.warn( 'THREE.GTAOPass: Unknown output type.' );

		}

	}

	// internals

	_renderPass( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		// save original state
		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		// setup pass state
		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this._fsQuad.material = passMaterial;
		this._fsQuad.render( renderer );

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_renderOverride( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera );
		this.scene.overrideMaterial = null;

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_overrideVisibility() {

		const scene = this.scene;
		const cache = this._visibilityCache;

		scene.traverse( function ( object ) {

			if ( ( object.isPoints || object.isLine || object.isLine2 || object.userData.noDepth ) && object.visible ) {

				object.visible = false;
				cache.push( object );

			}

		} );

	}

	_restoreVisibility() {

		const cache = this._visibilityCache;

		for ( let i = 0; i < cache.length; i ++ ) {

			cache[ i ].visible = true;

		}

		cache.length = 0;

	}

	_generateNoise( size, random ) {

		const simplex = new SimplexNoise( { random } );

		const arraySize = size * size * 4;
		const data = new Uint8Array( arraySize );

		for ( let i = 0; i < size; i ++ ) {

			for ( let j = 0; j < size; j ++ ) {

				const x = i;
				const y = j;

				data[ ( i * size + j ) * 4 ] = ( simplex.noise( x, y ) * 0.5 + 0.5 ) * 255;
				data[ ( i * size + j ) * 4 + 1 ] = ( simplex.noise( x + size, y ) * 0.5 + 0.5 ) * 255;
				data[ ( i * size + j ) * 4 + 2 ] = ( simplex.noise( x, y + size ) * 0.5 + 0.5 ) * 255;
				data[ ( i * size + j ) * 4 + 3 ] = ( simplex.noise( x + size, y + size ) * 0.5 + 0.5 ) * 255;

			}

		}

		const noiseTexture = new DataTexture( data, size, size, RGBAFormat, UnsignedByteType );
		noiseTexture.wrapS = RepeatWrapping;
		noiseTexture.wrapT = RepeatWrapping;
		noiseTexture.needsUpdate = true;

		return noiseTexture;

	}

}

GTAOPass.OUTPUT = {
	'Off': - 1,
	'Default': 0,
	'Diffuse': 1,
	'Depth': 2,
	'Normal': 3,
	'AO': 4,
	'Denoise': 5,
};

export { GTAOPass };
