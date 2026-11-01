// Fixtures for the Openverse tests (`mm sound find`, `mm sound fetch`): rows in the shape the API documents for
// /v1/audio/ and /v1/audio/{id}/ (api.openverse.org/v1/schema), and a few bytes that read as a WAV file. Nothing
// here reaches the network; the tests hand `mm` a fetch that answers from these.

export const ID = '8624ba61-57f1-4f98-8a85-ece206c319cf';
export const API_HOST = 'api.openverse.org';
export const FILE_URL = 'https://files.example.test/clips/door-slam.wav';

/** A WAV header and `n` bytes of silence: enough to be sniffed as a WAV and to decode. */
export function wavBytes(n = 4800) {
  const data = Buffer.alloc(n);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(36 + n, 4); head.write('WAVE', 8, 'latin1');
  head.write('fmt ', 12, 'latin1'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(48000, 24); head.writeUInt32LE(96000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36, 'latin1'); head.writeUInt32LE(n, 40);
  return Buffer.concat([head, data]);
}

const LICENCE_URLS = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  pdm: 'https://creativecommons.org/publicdomain/mark/1.0/',
};
const NAMES = { cc0: 'CC0 1.0', pdm: 'Public Domain Mark 1.0' };

/** One audio row, as /v1/audio/ and /v1/audio/{id}/ give it; `over` replaces fields. */
export function item(over = {}) {
  const license = over.license ?? 'cc0';
  const version = over.license_version ?? (license === 'cc0' || license === 'pdm' ? '1.0' : '4.0');
  const id = over.id ?? ID;
  const url = LICENCE_URLS[license] ?? `https://creativecommons.org/licenses/${license}/${version}/`;
  const name = NAMES[license] ?? `CC ${license.toUpperCase()} ${version}`;
  const row = {
    id,
    title: 'Door slam',
    indexed_on: '2024-01-02T03:04:05Z',
    foreign_landing_url: `https://catalogue.example.test/sound/${id.slice(0, 8)}`,
    url: FILE_URL,
    creator: 'a recordist',
    creator_url: 'https://catalogue.example.test/people/a-recordist',
    license,
    license_version: version,
    license_url: url,
    provider: 'testcatalogue',
    source: 'testcatalogue',
    category: 'sound_effect',
    genres: [],
    filesize: 4844,
    filetype: 'wav',
    tags: [{ accuracy: null, name: 'door', unstable__provider: 'testcatalogue' }],
    alt_files: null,
    attribution: `"Door slam" by a recordist is licensed under ${name}. To view a copy of this license, visit ${url}.`,
    fields_matched: ['title'],
    mature: false,
    audio_set: null,
    duration: 1250,
    bit_rate: 768000,
    sample_rate: 48000,
    thumbnail: null,
    detail_url: `https://api.openverse.org/v1/audio/${id}/`,
    related_url: `https://api.openverse.org/v1/audio/${id}/related/`,
    waveform: `https://api.openverse.org/v1/audio/${id}/waveform/`,
    unstable__sensitivity: [],
    ...over,
  };
  return row;
}

/** A /v1/audio/ page of `rows`. */
export const searchPage = (rows, over = {}) => ({ result_count: rows.length, page_count: 1, page_size: 20, page: 1, results: rows, warnings: [], ...over });

/** Eight distinct ids, for tests that need several recordings. */
export const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
