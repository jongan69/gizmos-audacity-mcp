import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairMacWavExport } from '../../src/audacity/mac-wav.js';

const platform = process.platform;
const directories: string[] = [];
afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: platform });
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function destination() {
  const directory = await mkdtemp(join(tmpdir(), 'audacity-mac-export-test-'));
  directories.push(directory);
  return join(directory, 'export.wav');
}
describe('macOS native WAV container workaround', () => {
  it('leaves other platforms untouched', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    await expect(repairMacWavExport('/missing.wav')).resolves.toBeUndefined();
  });
  it('does not rewrite an existing RIFF WAV', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const file = await destination();
    const original = Buffer.from('RIFF0000WAVEunchanged');
    await writeFile(file, original);
    await repairMacWavExport(file);
    expect(await readFile(file)).toEqual(original);
  });
  it('restores the exact native render if conversion cannot start', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.stubEnv('AUDACITY_FFMPEG', '/nonexistent-audacity-test-ffmpeg');
    const file = await destination();
    const original = Buffer.from('FORM0000AIFFpreserved native bytes');
    await writeFile(file, original);
    await expect(repairMacWavExport(file)).rejects.toThrow('original was restored');
    expect(await readFile(file)).toEqual(original);
    expect(await readdir(join(file, '..'))).toEqual(['export.wav']);
  });
});
