// Shared Ajv setup for the contracts (draft 2020-12, cross-file $refs by $id).
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schema = (name) => JSON.parse(readFileSync(join(ROOT, 'contracts', `${name}.schema.json`), 'utf8'));

export function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const brandS = schema('brand'), motionS = schema('motion'), styleS = schema('style'), storyS = schema('story'), opsS = schema('edit-ops');
  ajv.addSchema(brandS).addSchema(motionS).addSchema(styleS).addSchema(storyS).addSchema(opsS);
  return {
    brand: ajv.getSchema(brandS.$id),
    motion: ajv.getSchema(motionS.$id),
    style: ajv.getSchema(styleS.$id),
    story: ajv.getSchema(storyS.$id),
    editOps: ajv.getSchema(opsS.$id),
  };
}
