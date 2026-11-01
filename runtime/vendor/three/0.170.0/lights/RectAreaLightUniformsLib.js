// Ported from three.js r187 examples/jsm/lights/RectAreaLightUniformsLib.js (MIT, Copyright 2010-2026
// three.js authors; see ../LICENSE and the repository NOTICE). Only the `three` import is rewritten
// to the vendored core and the doc comments are shortened.
import { UniformsLib } from '../three.module.min.js';
import { RectAreaLightTexturesLib } from './RectAreaLightTexturesLib.js';

// Only relevant when using RectAreaLight with WebGLRenderer: before rect area lights can be used,
// the renderer's internal uniform library must be enhanced with RectAreaLightUniformsLib.init().
class RectAreaLightUniformsLib {

	static init() {

		RectAreaLightTexturesLib.init();

		const { LTC_FLOAT_1, LTC_FLOAT_2, LTC_HALF_1, LTC_HALF_2 } = RectAreaLightTexturesLib;

		// data textures

		UniformsLib.LTC_FLOAT_1 = LTC_FLOAT_1;
		UniformsLib.LTC_FLOAT_2 = LTC_FLOAT_2;

		UniformsLib.LTC_HALF_1 = LTC_HALF_1;
		UniformsLib.LTC_HALF_2 = LTC_HALF_2;

	}

}

export { RectAreaLightUniformsLib };
