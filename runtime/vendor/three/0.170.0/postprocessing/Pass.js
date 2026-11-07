// Ported from three.js r187 examples/jsm/postprocessing/Pass.js (MIT, Copyright 2010-2026 three.js
// authors; see ../LICENSE and the repository NOTICE). Only the `three` import is rewritten to the
// vendored core; the doc comments are shortened.
import {
	BufferGeometry,
	Float32BufferAttribute,
	OrthographicCamera,
	Mesh
} from '../three.module.min.js';

// Abstract base class for all post processing passes.
class Pass {

	constructor() {

		this.isPass = true;

		// if set to true, the pass is processed by the composer
		this.enabled = true;

		// if set to true, the pass indicates to swap read and write buffer after rendering
		this.needsSwap = true;

		// if set to true, the pass clears its buffer before rendering
		this.clear = false;

		// if set to true, the result of the pass is rendered to screen. The last pass in the composers
		// pass chain gets automatically rendered to screen, no matter how this property is configured.
		this.renderToScreen = false;

	}

	setSize( /* width, height */ ) {}

	render( /* renderer, writeBuffer, readBuffer, deltaTime, maskActive */ ) {

		console.error( 'THREE.Pass: .render() must be implemented in derived pass.' );

	}

	dispose() {}

}

// Helper for passes that need to fill the viewport with a single quad.

const _camera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

// https://github.com/mrdoob/three.js/pull/21358

class FullscreenTriangleGeometry extends BufferGeometry {

	constructor() {

		super();

		this.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

	}

}

const _geometry = new FullscreenTriangleGeometry();

// A full screen triangle: reassign `material` to run subsequent passes through one mesh.
class FullScreenQuad {

	constructor( material ) {

		this._mesh = new Mesh( _geometry, material );

	}

	dispose() {

		this._mesh.geometry.dispose();

	}

	render( renderer ) {

		renderer.render( this._mesh, _camera );

	}

	get material() {

		return this._mesh.material;

	}

	set material( value ) {

		this._mesh.material = value;

	}

}

export { Pass, FullScreenQuad };
