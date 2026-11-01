// Ported from three.js r187 examples/jsm/shaders/OutputShader.js (MIT, Copyright 2010-2026 three.js
// authors; see ../LICENSE and the repository NOTICE), with one change for a transparent canvas: the
// composer's targets hold colour premultiplied by coverage (alpha), so the shader divides the colour
// by alpha first, applies tone mapping and the transfer curve to the colour itself, and multiplies
// by alpha again. Without that, the curve would act on colour x coverage and every soft edge (a
// shadow, a halo, an antialiased rim) would come out lighter than the same pixel drawn directly.

// Performs tone mapping and colour space conversion for FX workflows; used by OutputPass.
const OutputShader = {

	name: 'OutputShader',

	uniforms: {

		'tDiffuse': { value: null },
		'toneMappingExposure': { value: 1 }

	},

	vertexShader: /* glsl */`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

	fragmentShader: /* glsl */`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			float coverage = texel.a;

			gl_FragColor = vec4( texel.rgb / max( coverage, 1e-4 ), coverage );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

			gl_FragColor.rgb *= coverage;

		}`

};

export { OutputShader };
