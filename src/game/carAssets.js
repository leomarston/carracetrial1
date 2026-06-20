import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Shared car-model cache. Every car GLB is fetched + parsed exactly once (on the
 * loading screen, via preloadCars) and kept here; the car-select previews and the
 * in-game vehicles then take cheap clones instead of re-fetching/re-parsing. This
 * is what makes the car-select screen instant.
 */
const loader = new GLTFLoader();
const cache = new Map(); // id -> THREE.Object3D (pristine, never mutated)

/**
 * Fetch + parse all the given cars into the cache (in parallel), reporting
 * progress 0..1 as each finishes.
 * @param {{id:string,url:string}[]} list
 * @param {(frac:number, id:string)=>void} [onProgress]
 */
export async function preloadCars(list, onProgress) {
  let done = 0;
  await Promise.all(
    list.map(async ({ id, url }) => {
      if (!cache.has(id)) {
        const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
        cache.set(id, gltf.scene);
      }
      done++;
      onProgress?.(done / list.length, id);
    }),
  );
}

export function hasCar(id) { return cache.has(id); }

/** A fresh clone of a preloaded car scene (callers may mutate it freely), or null. */
export function getCarScene(id) {
  const scene = cache.get(id);
  return scene ? scene.clone(true) : null;
}
