/**
 * Validates the race map against the official Khronos glTF validator.
 * Run with: npm run validate-map
 *
 * Exits non-zero if the asset has any validation ERRORS, so this can also
 * gate CI. Warnings (common for Sketchfab exports) are reported but tolerated.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import validator from 'gltf-validator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.resolve(__dirname, '../public/models/carracemap1.glb');

const bytes = await readFile(mapPath);

const report = await validator.validateBytes(new Uint8Array(bytes), {
  uri: 'carracemap1.glb',
});

const { numErrors, numWarnings, numInfos, numHints } = report.issues;

console.log('glTF validation report for carracemap1.glb');
console.log('--------------------------------------------');
console.log(`Validator : ${report.validatorVersion}`);
console.log(`Format    : glTF ${report.info?.version}  (${report.info?.generator ?? 'unknown generator'})`);
console.log(`Geometry  : ${report.info?.totalVertexCount?.toLocaleString() ?? '?'} vertices, ` +
            `${report.info?.totalTriangleCount?.toLocaleString() ?? '?'} triangles`);
console.log(`Draw calls: ${report.info?.drawCallCount ?? '?'}`);
console.log(`Materials : ${report.info?.materialCount ?? '?'}`);
console.log(`Animations: ${report.info?.animationCount ?? 0}`);
console.log(`Extensions: ${(report.info?.extensionsUsed ?? []).join(', ') || '(none)'}`);
console.log('--------------------------------------------');
console.log(`Errors: ${numErrors} · Warnings: ${numWarnings} · Infos: ${numInfos} · Hints: ${numHints}`);

if (report.issues.messages?.length) {
  // Print up to a handful of the most relevant messages.
  const shown = report.issues.messages.slice(0, 12);
  for (const m of shown) {
    console.log(`  [${m.severity === 0 ? 'ERROR' : m.severity === 1 ? 'WARN' : 'INFO'}] ${m.code} @ ${m.pointer || ''} — ${m.message}`);
  }
  if (report.issues.messages.length > shown.length) {
    console.log(`  …and ${report.issues.messages.length - shown.length} more`);
  }
}

if (numErrors > 0) {
  console.error('\n❌ Map has validation ERRORS — it would not import correctly.');
  process.exit(1);
}
console.log('\n✅ Map is a valid glTF 2.0 asset and imports correctly.');
