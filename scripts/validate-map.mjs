/**
 * Validates the game's glTF assets (map + car) against the official Khronos
 * glTF validator. Run with: npm run validate-map
 *
 * Exits non-zero if any asset has validation ERRORS, so this can gate CI.
 * Warnings/infos (common for Sketchfab exports) are reported but tolerated.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import validator from 'gltf-validator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(__dirname, '../public/models');

const ASSETS = ['carracemap1.glb', 'mercedes.glb', 'lamborghini.glb'];

let totalErrors = 0;

for (const name of ASSETS) {
  const bytes = await readFile(path.join(modelsDir, name));
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: name });
  const { numErrors, numWarnings, numInfos, numHints } = report.issues;
  totalErrors += numErrors;

  console.log(`\nglTF validation report for ${name}`);
  console.log('--------------------------------------------');
  console.log(`Validator : ${report.validatorVersion}`);
  console.log(`Format    : glTF ${report.info?.version}  (${report.info?.generator ?? 'unknown generator'})`);
  console.log(`Geometry  : ${report.info?.totalVertexCount?.toLocaleString() ?? '?'} vertices, ` +
              `${report.info?.totalTriangleCount?.toLocaleString() ?? '?'} triangles`);
  console.log(`Draw calls: ${report.info?.drawCallCount ?? '?'}`);
  console.log(`Materials : ${report.info?.materialCount ?? '?'}`);
  console.log(`Animations: ${report.info?.animationCount ?? 0}`);
  console.log(`Extensions: ${(report.info?.extensionsUsed ?? []).join(', ') || '(none)'}`);
  console.log(`Errors: ${numErrors} · Warnings: ${numWarnings} · Infos: ${numInfos} · Hints: ${numHints}`);

  if (numErrors > 0 && report.issues.messages?.length) {
    for (const m of report.issues.messages.filter((x) => x.severity === 0).slice(0, 12)) {
      console.log(`  [ERROR] ${m.code} @ ${m.pointer || ''} — ${m.message}`);
    }
  }
}

console.log('\n--------------------------------------------');
if (totalErrors > 0) {
  console.error(`❌ ${totalErrors} validation ERROR(s) found — an asset would not import correctly.`);
  process.exit(1);
}
console.log('✅ All assets are valid glTF 2.0 and import correctly.');
