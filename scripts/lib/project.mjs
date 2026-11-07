// A project folder is the user's own: project.json, story.json, assets/, inputs/ and out/. The engine renders it
// through a hidden work piece inside its git-ignored private folder, one per project path.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ROOT } from './browser.mjs';
import { PRIVATE_DIR, UsageError, slug } from './cli.mjs';

/** Where the work pieces live, relative to the repository root. */
export const WORK_DIR = join(PRIVATE_DIR, 'projects-work');

/** The work folder behind a project: stable for one path, distinct for two folders of the same name elsewhere. */
export const workDir = (root, folderAbs, id) => join(root, WORK_DIR, `${id}-${createHash('sha1').update(folderAbs).digest('hex').slice(0, 8)}`);

/** A story id for a folder name: lowercase letters, digits and hyphens, starting with a letter. */
export const projectId = (folder) => slug(basename(folder)) || 'project';

/** Reads `<folder>/project.json`: { folder (real path), project, id, work }. A usage error when it is not a project. */
export function readProject(folderArg, cwd = process.cwd()) {
  if (!folderArg) throw new UsageError('name the project folder');
  const given = resolve(cwd, folderArg);
  const file = join(given, 'project.json');
  if (!existsSync(given) || !statSync(given).isDirectory() || !existsSync(file)) throw new UsageError(`${given} is not a project (no project.json); make one with: mm project new <folder> --brand <brand-folder> --kind film|deck`);
  let project;
  try { project = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${file}: ${e.message}`); }
  const folder = realpathSync(given);
  const id = project.id;
  if (typeof id !== 'string' || !id) throw new UsageError(`${file} has no id`);
  return { folder, project, id, work: workDir(ROOT, folder, id) };
}
