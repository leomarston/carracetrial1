import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads the highway-battle race map (a self-contained glTF 2.0 binary, .glb).
 *
 * Why a plain GLTFLoader is enough for THIS asset:
 *   - extensionsRequired: (none)
 *   - extensionsUsed:     ["KHR_materials_unlit"]  -> supported natively by three.js
 *   - geometry is NOT Draco/Meshopt compressed     -> no DRACOLoader/MeshoptDecoder
 *   - textures are embedded PNGs (no KTX2/Basis)    -> no KTX2Loader
 * So the map imports completely and correctly with no extra decoders.
 *
 * The loader already:
 *   - applies the Sketchfab root matrix (Z-up -> Y-up), so the scene is upright,
 *   - decodes every texture with the correct color space (sRGB for base color),
 *   - builds MeshBasicMaterial for the unlit materials and MeshStandardMaterial
 *     for the rest, matching how the asset was authored.
 * We therefore do NOT mutate transforms or material colors — that would be the
 * surest way to import it "incorrectly".
 *
 * @param {string} url           Path to the .glb file.
 * @param {(pct:number, loaded:number, total:number)=>void} [onProgress]
 * @returns {Promise<{root: THREE.Group, gltf: object, stats: object}>}
 */
export function loadMap(url, onProgress) {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;

        // Collect stats and prepare meshes for the game (without changing how
        // the map looks). receiveShadow lets cars later cast shadows onto the road.
        let meshCount = 0;
        let triangleCount = 0;
        const materials = new Set();

        root.traverse((obj) => {
          if (obj.isMesh) {
            meshCount++;
            obj.receiveShadow = true;
            obj.castShadow = false; // baked/static map geometry
            obj.frustumCulled = true;

            const geom = obj.geometry;
            if (geom?.index) triangleCount += geom.index.count / 3;
            else if (geom?.attributes?.position) triangleCount += geom.attributes.position.count / 3;

            const mat = obj.material;
            if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
            else if (mat) materials.add(mat);
          }
        });

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const stats = {
          meshCount,
          triangleCount: Math.round(triangleCount),
          materialCount: materials.size,
          nodeCount: countNodes(root),
          bounds: { box, size, center },
          title: gltf.asset?.extras?.title ?? 'Race Map',
        };

        resolve({ root, gltf, stats });
      },
      (event) => {
        if (!onProgress) return;
        // event.total is only reliable when the server sends Content-Length.
        const total = event.total || 0;
        const pct = total > 0 ? (event.loaded / total) * 100 : 0;
        onProgress(pct, event.loaded, total);
      },
      (err) => {
        reject(new Error(`Failed to load map "${url}": ${err?.message ?? err}`));
      }
    );
  });
}

function countNodes(root) {
  let n = 0;
  root.traverse(() => n++);
  return n;
}
