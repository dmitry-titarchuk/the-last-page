import { BoxGeometry, Vector3 } from 'three';

// Скруглённый параллелепипед без дополнительных модулей Three.js.
export class RoundedBoxGeometry extends BoxGeometry {
  constructor(width, height, depth, segments = 3, radius = .025) {
    const divisions = segments * 2 + 1;
    super(1, 1, 1, divisions, divisions, divisions);
    const bevel = Math.min(radius, width / 2, height / 2, depth / 2);
    const inner = new Vector3(width / 2 - bevel, height / 2 - bevel, depth / 2 - bevel);
    const position = this.attributes.position;
    const normal = this.attributes.normal;
    const point = new Vector3();
    const direction = new Vector3();
    const flatEdge = .5 - 1 / divisions;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      direction.set(
        point.x - Math.max(-flatEdge, Math.min(flatEdge, point.x)),
        point.y - Math.max(-flatEdge, Math.min(flatEdge, point.y)),
        point.z - Math.max(-flatEdge, Math.min(flatEdge, point.z)),
      ).normalize();
      position.setXYZ(i,
        Math.max(-1, Math.min(1, point.x / flatEdge)) * inner.x + direction.x * bevel,
        Math.max(-1, Math.min(1, point.y / flatEdge)) * inner.y + direction.y * bevel,
        Math.max(-1, Math.min(1, point.z / flatEdge)) * inner.z + direction.z * bevel,
      );
      normal.setXYZ(i, direction.x, direction.y, direction.z);
    }
    this.computeBoundingBox();
    this.computeBoundingSphere();
  }
}
