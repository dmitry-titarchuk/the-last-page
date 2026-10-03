// Объёмный рисунок не зависит от UV: трещины покрывают и корпус, и округлую
// крышку, и фурнитуру. У каждого сундука свой постоянный вариант рисунка.
export function addStoneSurface(materials, seed) {
  const uniforms = {
    chestStone: { value: 0 }, chestMoss: { value: 0 }, chestSeed: { value: seed },
  };
  for (const material of materials) {
    material.customProgramCacheKey = () => 'chest-stone-v1';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `attribute vec3 stonePosition;\nvarying vec3 vStonePosition;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStonePosition = stonePosition;');
      shader.fragmentShader = `
        varying vec3 vStonePosition;
        uniform float chestStone;
        uniform float chestMoss;
        uniform float chestSeed;
        vec3 stoneHash(vec3 p) {
          return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)),
            dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
        }
        float stoneNoise(vec3 p) {
          vec3 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(stoneHash(cell).x, stoneHash(cell + vec3(1,0,0)).x, f.x),
            mix(stoneHash(cell + vec3(0,1,0)).x, stoneHash(cell + vec3(1,1,0)).x, f.x), f.y),
            mix(mix(stoneHash(cell + vec3(0,0,1)).x, stoneHash(cell + vec3(1,0,1)).x, f.x),
            mix(stoneHash(cell + vec3(0,1,1)).x, stoneHash(cell + vec3(1,1,1)).x, f.x), f.y), f.z);
        }
        float stoneCracks(vec3 p) {
          vec3 cell = floor(p), f = fract(p);
          float first = 10.0, second = 10.0;
          for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
            vec3 neighbor = vec3(float(x), float(y), float(z));
            vec3 delta = neighbor + stoneHash(cell + neighbor) - f;
            float distanceSquared = dot(delta, delta);
            if (distanceSquared < first) { second = first; first = distanceSquared; }
            else second = min(second, distanceSquared);
          }
          return 1.0 - smoothstep(0.018, 0.085, sqrt(second) - sqrt(first));
        }
        ${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          float stoneHeight = 0.0;
          if (chestStone > 0.0) {
          vec3 stonePoint = vStonePosition + vec3(chestSeed, chestSeed * 0.37, chestSeed * 0.73);
          float stoneGrain = stoneNoise(stonePoint * 65.0);
          float stoneWeather = stoneNoise(stonePoint * 13.0);
          float stoneCrack = stoneCracks(stonePoint * 7.0 + (stoneWeather - 0.5) * 0.45);
          float mossPatch = smoothstep(0.43, 0.68, stoneNoise(stonePoint * 9.0)
            + (0.35 - vStonePosition.y) * 0.28 + stoneCrack * 0.12) * chestMoss;
          vec3 rockColor = diffuseColor.rgb * (0.78 + stoneWeather * 0.35 + stoneGrain * 0.2);
          rockColor = mix(rockColor, vec3(0.095, 0.11, 0.12), stoneCrack * 0.85);
          rockColor = mix(rockColor, mix(vec3(0.08, 0.16, 0.035), vec3(0.3, 0.39, 0.09), stoneGrain), mossPatch);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockColor, chestStone);
          stoneHeight = chestStone * (stoneWeather * 0.012 + stoneGrain * 0.004
            - stoneCrack * 0.014 + mossPatch * stoneGrain * 0.009);
          }
        `)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (chestStone > 0.0) {
          vec3 stoneDx = dFdx(-vViewPosition), stoneDy = dFdy(-vViewPosition);
          vec3 stoneR1 = cross(stoneDy, normal), stoneR2 = cross(normal, stoneDx);
          float stoneDet = dot(stoneDx, stoneR1);
          vec3 stoneGradient = sign(stoneDet) * (dFdx(stoneHeight) * stoneR1 + dFdy(stoneHeight) * stoneR2);
          normal = normalize(abs(stoneDet) * normal - stoneGradient);
          }
        `);
    };
  }
  return uniforms;
}
