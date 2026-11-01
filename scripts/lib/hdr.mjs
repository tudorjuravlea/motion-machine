// An HDR screen recording made SDR. A phone records its screen in 10-bit PQ (SMPTE ST 2084) BT.2020, and
// PQ code values read as SDR ones give a washed-out, low-contrast screen. `mm media prep` converts such a
// source to BT.709 SDR in the pass that decodes it: a per-channel PQ EOTF, a linear-light BT.2020 to BT.709
// matrix and an sRGB OETF, with PQ reference white at SDR white and a hard clip above it (a UI recording is
// SDR content in an HDR container, so no highlight roll-off that would grey the whole UI down).
// Ported from showcase (MIT, same author; see NOTICE): its HDR to SDR filter.
const PQ_M1_INV = 16384 / 2610;
const PQ_M2_INV = 4096 / (2523 * 128);
const PQ_C1 = 3424 / 4096;
const PQ_C2 = (2413 / 4096) * 32;
const PQ_C3 = (2392 / 4096) * 32;
/** The nits PQ white maps onto: the SDR reference white, where a phone composes its SDR interface. */
export const HDR_REFERENCE_NITS = 100;

/** True for an ffprobe `color_transfer` that is HDR and must be converted. */
export const isHdr = (colorTransfer) => colorTransfer === 'smpte2084';

/** The ffmpeg -vf chain from PQ / BT.2020 to BT.709 SDR, ending in plain BT.709 frames with no HDR side data. */
export function hdrToSdrFilter(referenceNits = HDR_REFERENCE_NITS) {
  const n = 'clip(val/maxval,0,1)';
  const e = `pow(${n},${PQ_M2_INV})`;
  const linear = `pow(max(${e}-${PQ_C1},0)/(${PQ_C2}-${PQ_C3}*${e}),${PQ_M1_INV})`;
  const eotf = `maxval*min((${linear})*${10000 / referenceNits},1)`;   // PQ to nits to SDR-white-relative, clipped at 1
  const oetf = `maxval*if(lte(${n},0.0031308),12.92*(${n}),1.055*pow(${n},${1 / 2.4})-0.055)`;
  // BT.2020 to BT.709 in linear light; colours outside 709 clip
  const primaries = 'colorchannelmixer=rr=1.6605:rg=-0.5876:rb=-0.0728:gr=-0.1246:gg=1.1329:gb=-0.0083:br=-0.0182:bg=-0.1006:bb=1.1187';
  return [
    'format=gbrp16le',   // 16-bit planar RGB: headroom for the linear-light step
    `lutrgb=r='${eotf}':g='${eotf}':b='${eotf}'`,
    primaries,
    `lutrgb=r='${oetf}':g='${oetf}':b='${oetf}'`,
    'scale=out_color_matrix=bt709:out_range=tv',
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',   // say what the frames now are
    'sidedata=delete:type=MASTERING_DISPLAY_METADATA',   // and drop the HDR metadata, or a player tone-maps them again
    'sidedata=delete:type=CONTENT_LIGHT_LEVEL',
  ].join(',');
}
