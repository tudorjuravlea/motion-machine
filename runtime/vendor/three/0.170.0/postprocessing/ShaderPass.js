// Ported from three.js r187 examples/jsm/postprocessing/ShaderPass.js (MIT, Copyright 2010-2026
// three.js authors; see ../LICENSE and the repository NOTICE). Only the `three` import is rewritten
// to the vendored core; the doc comments are shortened.
import {
	ShaderMaterial,
	UniformsUtils
} from '../three.module.min.js';
import { Pass, FullScreenQuad } from './Pass.js';

// A pass that runs a raw GLSL shader object (or a ShaderMaterial) over the read buffer.
class ShaderPass extends Pass {

	constructor( shader, textureID = 'tDiffuse' ) {

		super();

		this.textureID = textureID;

		this.uniforms = null;

		this.material = null;

		if ( shader instanceof ShaderMaterial ) {

			this.uniforms = shader.uniforms;

			this.material = shader;

		} else if ( shader ) {

			this.uniforms = UniformsUtils.clone( shader.uniforms );

			this.material = new ShaderMaterial( {

				name: ( shader.name !== undefined ) ? shader.name : 'unspecified',
				defines: Object.assign( {}, shader.defines ),
				uniforms: this.uniforms,
				vertexShader: shader.vertexShader,
				fragmentShader: shader.fragmentShader

			} );

		}

		// internals

		this._fsQuad = new FullScreenQuad( this.material );

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		if ( this.uniforms[ this.textureID ] ) {

			this.uniforms[ this.textureID ].value = readBuffer.texture;

		}

		this._fsQuad.material = this.material;

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this._fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
			if ( this.clear ) renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );
			this._fsQuad.render( renderer );

		}

	}

	dispose() {

		this.material.dispose();

		this._fsQuad.dispose();

	}

}

export { ShaderPass };
