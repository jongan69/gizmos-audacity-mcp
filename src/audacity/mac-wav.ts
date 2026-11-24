import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { runFfmpeg } from '../analysis/executables.js';

/** Audacity-3.7.9 src/commands/ImportExportCommands.cpp:127-141 omits
 * ExportTaskBuilder::SetFormat(formatIndex). On macOS mod-pcm's index 0 is
 * AIFF, so Export2 can write AIFF under a WAV filename. Rewrap only that
 * observed case after native success, keeping the native render on failure.
 * No resampling, gain, effects or speech generation occurs here. */
export async function repairMacWavExport(file: string): Promise<void> {
  if (process.platform !== 'darwin' || extname(file).toLowerCase() !== '.wav') return;
  const handle = await open(file, 'r');
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (header.toString('ascii', 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(header.toString('ascii', 8, 12))) return;
  const original = `${file}.native-${randomUUID()}.aiff`;
  await rename(file, original);
  try {
    await runFfmpeg(['-v', 'error', '-nostdin', '-n', '-i', original, '-map_metadata', '0', '-c:a', 'pcm_s24le', file]);
  } catch (error) {
    await rm(file, { force: true });
    await rename(original, file);
    throw new Error(
      `Native macOS export was AIFF; WAV conversion failed and its original was restored: ${String(error)}`,
    );
  }
  await rm(original);
}
