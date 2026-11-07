// Ported from three.js r187 examples/jsm/postprocessing/EffectComposer.js (MIT, Copyright 2010-2026
// three.js authors; see ../LICENSE and the repository NOTICE), adapted to the vendored 0.170.0 core:
// the `three` import is rewritten to it; there is no Timer in 0.170 and a frame here is a pure
// function of t, so the composer keeps no clock (render() passes a fixed delta of 0 to its passes);
// the stencil MaskPass / ClearMaskPass machinery is left out (no pass here masks); the doc comments
// are shortened.
import {
	HalfFloatType,
	NoBlending,
	Vector2,
	WebGLRenderTarget
} from '../three.module.min.js';
import { CopyShader } from '../shaders/CopyShader.js';
import { ShaderPass } from './ShaderPass.js';

// Manages a chain of post-processing passes executed in order; the last enabled pass renders to screen.
class EffectComposer {

	constructor( renderer, renderTarget ) {

		this.renderer = renderer;

		this._pixelRatio = renderer.getPixelRatio();

		if ( renderTarget === undefined ) {

			const size = renderer.getSize( new Vector2() );
			this._width = size.width;
			this._height = size.height;

			renderTarget = new WebGLRenderTarget( this._width * this._pixelRatio, this._height * this._pixelRatio, { type: HalfFloatType } );
			renderTarget.texture.name = 'EffectComposer.rt1';

		} else {

			this._width = renderTarget.width;
			this._height = renderTarget.height;

		}

		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();
		this.renderTarget2.texture.name = 'EffectComposer.rt2';

		this.writeBuffer = this.renderTarget1;
		this.readBuffer = this.renderTarget2;

		// whether the final pass is rendered to the screen (default framebuffer) or not
		this.renderToScreen = true;

		this.passes = [];

		// a copy pass used for internal swap operations
		this.copyPass = new ShaderPass( CopyShader );
		this.copyPass.material.blending = NoBlending;

	}

	swapBuffers() {

		const tmp = this.readBuffer;
		this.readBuffer = this.writeBuffer;
		this.writeBuffer = tmp;

	}

	addPass( pass ) {

		this.passes.push( pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	insertPass( pass, index ) {

		this.passes.splice( index, 0, pass );
		pass.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

	}

	removePass( pass ) {

		const index = this.passes.indexOf( pass );

		if ( index !== - 1 ) {

			this.passes.splice( index, 1 );

		}

	}

	isLastEnabledPass( passIndex ) {

		for ( let i = passIndex + 1; i < this.passes.length; i ++ ) {

			if ( this.passes[ i ].enabled ) {

				return false;

			}

		}

		return true;

	}

	// Executes all enabled passes in order to produce the final frame.
	render( deltaTime = 0 ) {

		const currentRenderTarget = this.renderer.getRenderTarget();

		for ( let i = 0, il = this.passes.length; i < il; i ++ ) {

			const pass = this.passes[ i ];

			if ( pass.enabled === false ) continue;

			pass.renderToScreen = ( this.renderToScreen && this.isLastEnabledPass( i ) );
			pass.render( this.renderer, this.writeBuffer, this.readBuffer, deltaTime, false );

			if ( pass.needsSwap ) {

				this.swapBuffers();

			}

		}

		this.renderer.setRenderTarget( currentRenderTarget );

	}

	reset( renderTarget ) {

		if ( renderTarget === undefined ) {

			const size = this.renderer.getSize( new Vector2() );
			this._pixelRatio = this.renderer.getPixelRatio();
			this._width = size.width;
			this._height = size.height;

			renderTarget = this.renderTarget1.clone();
			renderTarget.setSize( this._width * this._pixelRatio, this._height * this._pixelRatio );

		}

		this.renderTarget1.dispose();
		this.renderTarget2.dispose();
		this.renderTarget1 = renderTarget;
		this.renderTarget2 = renderTarget.clone();

		this.writeBuffer = this.renderTarget1;
		this.readBuffer = this.renderTarget2;

	}

	setSize( width, height ) {

		this._width = width;
		this._height = height;

		const effectiveWidth = this._width * this._pixelRatio;
		const effectiveHeight = this._height * this._pixelRatio;

		this.renderTarget1.setSize( effectiveWidth, effectiveHeight );
		this.renderTarget2.setSize( effectiveWidth, effectiveHeight );

		for ( let i = 0; i < this.passes.length; i ++ ) {

			this.passes[ i ].setSize( effectiveWidth, effectiveHeight );

		}

	}

	setPixelRatio( pixelRatio ) {

		this._pixelRatio = pixelRatio;

		this.setSize( this._width, this._height );

	}

	dispose() {

		this.renderTarget1.dispose();
		this.renderTarget2.dispose();

		this.copyPass.dispose();

	}

}

export { EffectComposer };
