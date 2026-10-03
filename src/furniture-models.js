import * as THREE from 'three';
import { RoundedBoxGeometry } from './rounded-box.js';
import { sceneConfig } from './config.js';
import { perimeterModels, decorationModels } from './model-registry.js';

const commonDecorations = decorationModels.map(({ id }) => id);

export function createDecorationModel(scene, id) {
  if (!decorationModels.some((model) => model.id === id)) throw new Error(`Неизвестный предмет: ${id}`);
  return createPerimeterModel(scene, 'decoration', 1, id);
}

export function createPerimeterModel(scene, variant, span = 1, decorationId) {
  const entry = perimeterModels.find((model) => model.id === variant);
  if (variant === 'decoration') {
    if (!decorationModels.some((model) => model.id === decorationId)) throw new Error(`Неизвестный предмет: ${decorationId}`);
  } else if (!entry) throw new Error(`Неизвестная мебель: ${variant}`);
  if (!Number.isInteger(span) || span < 1 || span > (entry?.maxSpan ?? 1)) {
    throw new Error('Недопустимая длина модели');
  }
  if (['stack', 'upright', 'upright-no-frame'].includes(variant)) {
    return scene.createObstacle(variant, span);
  }
  const group = new THREE.Group();
  const materials = new Map();
  const mat = (color) => {
    if (!materials.has(color)) materials.set(color, scene.material(color));
    return materials.get(color);
  };
  const woodColor = Math.random() < .5 ? 0x73553f : 0x605342;
  const box = (size, position, color = woodColor, parent = group) => scene.block(parent, size, position, mat(color));
  const round = (geometry, position, color, parent = group) => {
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const softBox = (size, position, color, radius = .025, parent = group) =>
    round(new RoundedBoxGeometry(...size, 3, radius), position, color, parent);
  const tube = (points, radius, color, parent = group) => round(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
    24, radius, 8, false), [0, 0, 0], color, parent);
  const rod = (from, to, radius, color = woodColor, parent = group) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mesh = round(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10),
      a.clone().add(b).multiplyScalar(.5).toArray(), color, parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return mesh;
  };
  const paper = (points, position, color, parent) => {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const mesh = round(new THREE.ShapeGeometry(shape), position, color, parent);
    mesh.rotation.x = -Math.PI / 2;
    mesh.material.side = THREE.DoubleSide;
    return mesh;
  };
  const gueridon = (style, x = 0, height = .36, radius = .3) => {
    round(new THREE.CylinderGeometry(radius, radius, .04, 32), [x, height - .02, 0], woodColor);
    round(new THREE.TorusGeometry(radius - .014, .008, 6, 32), [x, height - .002, 0], 0xb59b65).rotation.x = Math.PI / 2;
    if (style === 'tripod') {
      round(new THREE.CylinderGeometry(.045, .065, height - .08, 12), [x, (height - .08) / 2 + .04, 0], woodColor);
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI / 2 + i * Math.PI * 2 / 3;
        rod([x, .13, 0], [x + Math.cos(angle) * radius * .82, .03, Math.sin(angle) * radius * .82], .022);
      }
    } else {
      round(new THREE.CylinderGeometry(radius * .68, radius * .8, .045, 24), [x, .0225, 0], woodColor);
      round(new THREE.CylinderGeometry(.042, .055, height - .085, 16), [x, (height - .085) / 2 + .045, 0], woodColor);
      for (const y of [.085, height - .075]) {
        const bead = round(new THREE.SphereGeometry(1, 16, 10), [x, y, 0], woodColor);
        bead.scale.set(.075, .04, .075);
      }
    }
    return height;
  };
  const width = span - .08;
  const palette = [0x586c60, 0x934f43, 0xb49357, 0x425968, 0x74617a];
  const insetBooks = [];
  const books = (left, right, base, height, z = .02, parent = group) => {
    let x = left;
    while (x + .1 < right) {
      const thickness = .075 + Math.random() * .045;
      const h = height * (.72 + Math.random() * .28);
      const color = palette[Math.floor(Math.random() * palette.length)];
      const book = box([thickness, h, .26], [x + thickness / 2, base + h / 2, z], color, parent);
      if (variant === 'low-shelf') insetBooks.push({ mesh: book, thickness });
      for (const y of [base + .06, base + h - .045]) {
        const stripe = box([thickness * .65, .015, .008], [x + thickness / 2, y, z + .134], 0xc5a469, parent);
        if (variant === 'low-shelf') insetBooks.push({ mesh: stripe, thickness });
      }
      x += thickness + .018;
    }
  };
  const shelf = (height, tiers, bookDepth = .02) => {
    box([width, height, .055], [0, height / 2, -.32], 0x403f33);
    for (const x of [-width / 2 + .035, width / 2 - .035]) box([.07, height, .67], [x, height / 2, 0]);
    for (let level = 0; level <= tiers; level++) {
      const y = .075 + level * (height - .12) / tiers;
      box([width, .055, .69], [0, y, 0]);
      if (level < tiers) {
        for (let bay = 0; bay < span; bay++) {
          books(bay - span / 2 + .105, bay - span / 2 + .9, y + .028, (height - .12) / tiers - .08, bookDepth);
        }
      }
    }
    for (let i = 1; i < span; i++) box([.045, height, .62], [i - span / 2, height / 2, 0]);
    box([width + .02, .065, .73], [0, height + .015, 0]);
  };
  const feet = (w, d, height) => {
    for (const x of [-w / 2 + .09, w / 2 - .09]) for (const z of [-d / 2 + .09, d / 2 - .09]) {
      box([.075, height, .075], [x, height / 2, z]);
    }
  };
  const plant = (x, base, small = false, parent = group) => {
    const potHeight = small ? .17 : .3;
    const radius = small ? .14 : .22;
    round(new THREE.CylinderGeometry(radius, radius * .72, potHeight, 10), [x, base + potHeight / 2, 0], 0x9e7055, parent);
    round(new THREE.CylinderGeometry(radius * .87, radius * .87, .015, 10), [x, base + potHeight, 0], 0x413b2c, parent);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const leaf = round(new THREE.SphereGeometry(1, 8, 6),
        [x + Math.cos(angle) * radius * .65, base + potHeight + (small ? .08 : .28), Math.sin(angle) * radius * .65],
        i % 2 ? 0x5c7951 : 0x3f6350, parent);
      leaf.scale.set(small ? .065 : .095, small ? .12 : .33, small ? .045 : .065);
      leaf.rotation.set(Math.sin(angle) * .55, 0, -Math.cos(angle) * .55);
    }
    if (small) {
      for (const offset of [-.07, .04]) {
        round(new THREE.SphereGeometry(.028, 8, 6), [x + offset, base + .34, .03], 0xd5b777, parent);
      }
    }
  };
  const glowing = (mesh, intensity = .22) => {
    // Отдельный материал: свечение не окрашивает остальные детали модели.
    mesh.material = mesh.material.clone();
    mesh.material.emissive.set(0xffcc86);
    mesh.material.emissiveIntensity = intensity;
    return mesh;
  };
  const readingLamp = (base) => {
    const item = new THREE.Group();
    item.position.y = base;
    item.userData.decoration = 'reading-lamp';
    group.add(item);
    // Panthella: расширяющаяся плавная ножка и полусферический открытый купол.
    const stem = [[.105, 0], [.105, .012], [.085, .023], [.054, .052],
      [.028, .09], [.018, .15], [.018, .235]].map(([r, y]) => new THREE.Vector2(r, y));
    round(new THREE.LatheGeometry(stem, 40), [0, 0, 0], 0xe8dfcc, item);
    const profile = (radius) => Array.from({ length: 17 }, (_, i) => {
      const angle = i * Math.PI / 32;
      return new THREE.Vector2(Math.sin(angle) * radius, Math.cos(angle) * radius);
    });
    const shade = glowing(round(new THREE.LatheGeometry(profile(.18), 48), [0, .205, 0], 0xe8dfcc, item), .12);
    shade.userData.lampPart = 'shade';
    const lining = glowing(round(new THREE.LatheGeometry(profile(.173), 48), [0, .205, 0], 0xffefd3, item), .3);
    lining.material.side = THREE.BackSide;
    lining.userData.lampPart = 'lining';
    round(new THREE.TorusGeometry(.1765, .0035, 8, 48), [0, .205, 0], 0xe8dfcc, item).rotation.x = Math.PI / 2;
    glowing(round(new THREE.SphereGeometry(.035, 20, 12), [0, .237, 0], 0xffefd3, item), .5);
  };
  const decoration = (kind, x, base) => {
    const anchor = new THREE.Group();
    anchor.position.set(x, base, 0);
    anchor.userData.decoration = kind;
    group.add(anchor);
    const item = new THREE.Group();
    item.rotation.y = (Math.random() - .5) * .3;
    anchor.add(item);
    if (kind === 'flowers') {
      round(new THREE.CylinderGeometry(.095, .065, .13, 10), [0, .065, 0], 0x829a90, item);
      const blooms = [[-.1, .265, .005], [-.055, .33, -.025], [0, .365, .005], [.055, .325, .03], [.1, .26, -.01]];
      for (const [i, [px, py, pz]] of blooms.entries()) {
        // Внутри вазы стебли собраны вместе, к цветкам расходятся веером.
        tube([[0, .055, 0], [px * .16, .135, pz * .16], [px * .55, .21, pz * .55], [px, py, pz]],
          .007, 0x557351, item);
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5;
          round(new THREE.SphereGeometry(.025, 8, 6), [px + Math.cos(angle) * .032, py + Math.sin(angle) * .032, pz + .012],
            i % 2 ? 0xd6b269 : 0xb77b79, item);
        }
        round(new THREE.SphereGeometry(.016, 8, 6), [px, py, pz + .034], 0xe9d4a1, item);
      }
    } else if (kind === 'desk-lamp') {
      round(new THREE.CylinderGeometry(.13, .16, .035, 12), [0, .0175, 0], 0x435c50, item);
      for (const x of [-.1, .1]) round(new THREE.CylinderGeometry(.012, .012, .25, 8), [x, .15, 0], 0xb59b65, item);
      box([.36, .075, .17], [0, .2925, 0], 0x3b7163, item);
      const light = box([.3, .012, .13], [0, .249, 0], 0xffdea0, item);
      light.material.emissive.set(0xe9b95a);
      light.material.emissiveIntensity = .5;
    } else if (['statuette', 'owl-small', 'owl-tall'].includes(kind)) {
      const owlColor = kind === 'owl-small' ? 0xb66f4c : kind === 'owl-tall' ? 0xe9dfc8 : 0xa58b5e;
      // Три силуэта сов с разной высотой и окраской.
      box([.23, .045, .2], [0, .0225, 0], 0x48473d, item);
      const body = round(new THREE.SphereGeometry(1, 32, 24), [0, .15, 0], owlColor, item);
      body.scale.set(.09, .105, .07);
      round(new THREE.SphereGeometry(.075, 32, 24), [0, .24, .005], owlColor, item);
      // Сложенные крылья прилегают к бокам; нижние концы слегка сужены.
      const wingColor = new THREE.Color(owlColor).multiplyScalar(.9).getHex();
      for (const side of [-1, 1]) {
        const geometry = new THREE.SphereGeometry(1, 32, 24);
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const taper = .8 + .2 * positions.getY(i);
          positions.setX(i, positions.getX(i) * taper);
          positions.setZ(i, positions.getZ(i) * taper);
        }
        geometry.computeVertexNormals();
        const wing = round(geometry, [side * .077, .145, .002], wingColor, item);
        wing.scale.set(.029, .085, .052);
        wing.rotation.z = side * .16;
      }
      for (const x of [-.045, .045]) {
        const tuft = round(new THREE.ConeGeometry(.025, .065, 24), [x, .305, 0], owlColor, item);
        tuft.scale.z = .7;
        tuft.rotation.z = -Math.sign(x) * .15;
        round(new THREE.SphereGeometry(.019, 24, 16), [x, .25, .064], 0xe5d3a5, item);
        round(new THREE.SphereGeometry(.009, 20, 12), [x, .25, .08], 0x333e36, item);
      }
      round(new THREE.ConeGeometry(.019, .04, 16), [0, .217, .077], 0xc5a469, item).rotation.x = Math.PI / 2;
      item.scale.setScalar(kind === 'owl-small' ? .72 : kind === 'owl-tall' ? 1.18 : 1);
    } else if (kind === 'umbrella') {
      // Сложенный зонтик лежит на столе; изогнутая ручка и тканевые складки.
      rod([-.25, .047, 0], [.22, .047, 0], .008, 0xb59b65, item);
      const canopy = round(new THREE.CylinderGeometry(.015, .047, .34, 12), [-.045, .047, 0], 0x425968, item);
      canopy.rotation.z = Math.PI / 2;
      for (const z of [-.025, .025]) rod([-.21, .053, z * .3], [.11, .071, z], .004, 0x72858c, item);
      tube([[.2, .047, 0], [.26, .047, 0], [.295, .047, .035], [.275, .047, .075], [.24, .047, .065]], .012, 0x73553f, item);
      // Тонкий ремешок облегает ткань, без выступающей прямоугольной пряжки.
      round(new THREE.CylinderGeometry(.036, .039, .016, 12), [.02, .047, 0], 0x9a8058, item).rotation.z = Math.PI / 2;
    } else if (kind === 'newspaper') {
      box([.39, .012, .29], [0, .006, 0], 0xded5bb, item);
      box([.34, .002, .022], [0, .013, -.095], 0x4d5048, item);
      box([.1, .002, .082], [-.11, .013, -.017], 0x929486, item);
      for (let row = 0; row < 8; row++) for (const x of [-.11, .01, .12]) {
        if (x < 0 && row < 4) continue;
        box([.084, .002, .004], [x, .013, -.051 + row * .022], 0x77786a, item);
      }
      box([.002, .002, .27], [0, .014, 0], 0xb9ae93, item);
    } else if (kind === 'open-letter') {
      box([.34, .009, .22], [0, .0045, .025], 0xc9b18c, item);
      paper([[-.17, -.085], [0, -.22], [.17, -.085]], [0, .01, 0], 0xddc9a7, item);
      box([.245, .003, .26], [.012, .012, -.035], 0xf0e5cf, item);
      for (let row = 0; row < 6; row++) box([row === 5 ? .1 : .19, .001, .003],
        [.005, .014, -.125 + row * .026], 0x78766c, item);
      paper([[-.17, -.085], [0, .01], [-.17, .135]], [0, .016, 0], 0xe2cfad, item);
      paper([[.17, -.085], [.17, .135], [0, .01]], [0, .017, 0], 0xe2cfad, item);
      paper([[-.17, .135], [0, .012], [.17, .135]], [0, .018, 0], 0xd8bf98, item);
    } else if (kind === 'coffee-cup') {
      round(new THREE.CylinderGeometry(.15, .13, .017, 32), [0, .0085, 0], 0xeae1ce, item);
      round(new THREE.TorusGeometry(.13, .009, 8, 32), [0, .02, 0], 0xd1b67b, item).rotation.x = Math.PI / 2;
      round(new THREE.CylinderGeometry(.077, .05, .11, 24, 1, true), [0, .074, 0], 0xf2ead9, item);
      round(new THREE.CylinderGeometry(.067, .067, .006, 24), [0, .115, 0], 0x493020, item);
      round(new THREE.TorusGeometry(.073, .006, 8, 24), [0, .129, 0], 0xd1b67b, item).rotation.x = Math.PI / 2;
      const handle = round(new THREE.TorusGeometry(.039, .01, 8, 20), [.088, .074, 0], 0xf2ead9, item);
      handle.scale.x = .8;
      rod([-.105, .029, -.08], [.07, .029, -.1], .005, 0xb5b6aa, item);
      const spoon = round(new THREE.SphereGeometry(1, 10, 6), [.083, .029, -.101], 0xb5b6aa, item);
      spoon.scale.set(.023, .004, .014);
    } else if (kind === 'white-cat') {
      const porcelain = 0xf2eee4;
      const ellipsoid = (position, scale) => {
        const mesh = round(new THREE.SphereGeometry(1, 32, 20), position, porcelain, item);
        mesh.scale.set(...scale);
      };
      // Единая оболочка от основания до макушки без стыков трёх сфер.
      // В профиле задаём ширину, высоту, глубину и смещение вперёд.
      const silhouette = [
        [0, 0, 0, -.02], [.067, .025, .056, -.02],
        [.089, .075, .074, -.02], [.087, .12, .071, -.013],
        [.071, .175, .06, .002], [.052, .23, .047, .018],
        [.065, .265, .056, .025], [.073, .295, .062, .025],
        [.058, .333, .05, .023], [0, .363, 0, .02],
      ];
      const profile = new THREE.CatmullRomCurve3(silhouette.map(([rx, y, rz]) => new THREE.Vector3(rx, y, rz)));
      const centers = new THREE.CatmullRomCurve3(silhouette.map(([, y, , z]) => new THREE.Vector3(0, y, z)));
      const body = new THREE.SphereGeometry(1, 32, 48);
      const positions = body.getAttribute('position');
      const uv = body.getAttribute('uv');
      const crownStart = 7 / (silhouette.length - 1);
      for (let i = 0; i < positions.count; i++) {
        const t = uv.getY(i);
        const section = profile.getPoint(t);
        let centerZ = centers.getPoint(t).z;
        // Эллиптический купол сходится с горизонтальной касательной,
        // а не конусом к последней точке интерполированного профиля.
        if (t >= crownStart) {
          const latitude = (t - crownStart) / (1 - crownStart) * Math.PI / 2;
          section.set(.073 * Math.cos(latitude), .295 + .068 * Math.sin(latitude),
            .062 * Math.cos(latitude));
          centerZ = .025 - .005 * Math.sin(latitude);
        }
        const angle = Math.atan2(positions.getZ(i), positions.getX(i));
        positions.setXYZ(i, section.x * Math.cos(angle), section.y,
          centerZ + section.z * Math.sin(angle));
      }
      body.computeVertexNormals();
      round(body, [0, 0, 0], porcelain, item);
      for (const x of [-.046, .046]) {
        const ear = round(new THREE.ConeGeometry(.029, .065, 24), [x, .352, .018], porcelain, item);
        ear.scale.z = .55;
        ear.rotation.z = -Math.sign(x) * .18;
        ellipsoid([x * .72, .078, .043], [.024, .065, .025]);
        ellipsoid([x * .72, .016, .064], [.028, .016, .036]);
        round(new THREE.SphereGeometry(.009, 8, 6), [x * .7, .304, .079], 0x789989, item);
      }
      ellipsoid([0, .277, .072], [.038, .021, .019]);
      round(new THREE.SphereGeometry(.007, 16, 10), [0, .285, .089], 0xc69291, item);
      const tailPoints = [[0, .06, -.065], [.1, .038, -.05], [.125, .026, .045], [.07, .021, .09]];
      round(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
        tailPoints.map((point) => new THREE.Vector3(...point))), 48, .018, 16, false),
        [0, 0, 0], porcelain, item);
      round(new THREE.SphereGeometry(.018, 24, 16), tailPoints.at(-1), porcelain, item);
    } else if (kind === 'book-stack') {
      for (let i = 0; i < 3; i++) {
        const volume = new THREE.Group();
        volume.position.set(i % 2 ? .025 : -.015, i * .05, 0);
        volume.rotation.y = i % 2 ? -.12 : .1;
        item.add(volume);
        const color = palette[(i + Math.floor(Math.random() * palette.length)) % palette.length];
        box([.34 - i * .025, .035, .23], [0, .025, 0], 0xe5d7b8, volume);
        for (const y of [.004, .047]) box([.36 - i * .025, .008, .25], [0, y, 0], color, volume);
        box([.36 - i * .025, .05, .015], [0, .025, -.12], color, volume);
      }
    } else if (kind === 'standing-books') {
      books(-.2, .2, 0, .28, 0, item);
      for (const x of [-.22, .22]) box([.035, .19, .27], [x, .095, 0], 0xa1875c, item);
    } else if (kind === 'glasses') {
      item.rotation.y = -.28;
      // Оправа в плоскости XY, раскрытые дужки уходят назад по Z.
      // Нижний край оправы и загнутые концы дужек опираются на ткань.
      for (const x of [-.09, .09]) {
        const rim = round(new THREE.TorusGeometry(.072, .009, 8, 32), [x, .071, .055], 0x382a25, item);
        rim.scale.y = .86;
        const lens = round(new THREE.CircleGeometry(.063, 32), [x, .071, .055], 0xc7ded6, item);
        lens.scale.y = .86;
        lens.material = new THREE.MeshStandardMaterial({ color: 0xc7ded6, transparent: true,
          opacity: .22, roughness: .15, side: THREE.DoubleSide, depthWrite: false });
        const side = Math.sign(x);
        tube([[side * .165, .071, .055], [side * .171, .071, -.045],
          [side * .16, .045, -.135], [side * .133, .009, -.15]], .007, 0x382a25, item);
        round(new THREE.SphereGeometry(.011, 8, 6), [side * .165, .071, .055], 0xc5a469, item);
      }
      tube([[-.018, .071, .055], [0, .079, .055], [.018, .071, .055]], .007, 0xc5a469, item);
    } else if (kind === 'globe') {
      const brass = 0xb59b65;
      round(new THREE.CylinderGeometry(.105, .12, .025, 24), [0, .0125, 0], woodColor, item);
      rod([0, .025, 0], [0, .115, 0], .023, brass, item);
      const globe = new THREE.Group();
      globe.position.y = .235;
      globe.rotation.z = -.28;
      item.add(globe);
      round(new THREE.SphereGeometry(.13, 32, 20), [0, 0, 0], 0x728f94, globe);
      round(new THREE.TorusGeometry(.15, .009, 8, 48), [0, 0, 0], brass, globe);
      rod([0, -.16, 0], [0, .16, 0], .007, brass, globe);
      // Неровные контуры материков лежат на сфере, а не на плоских наклейках.
      const spherical = (longitude, latitude, radius) => new THREE.Vector3(
        Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude),
        Math.cos(latitude) * Math.cos(longitude)).multiplyScalar(radius);
      const continents = [
        [[-.95, .85], [-.45, .9], [-.3, .6], [-.5, .3], [-.7, .4], [-.9, .65]],
        [[-.55, .25], [-.25, .1], [-.2, -.2], [-.45, -.75], [-.6, -.25]],
        [[.05, .5], [.4, .6], [.55, .2], [.35, -.45], [.15, -.15], [0, .2]],
        [[.4, .7], [.8, .95], [1.65, .65], [1.8, .2], [1.1, .1], [.65, .35]],
        [[1.45, -.4], [1.9, -.35], [2, -.65], [1.55, -.7]],
        [[-2.1, .85], [-1.8, .4], [-2.2, .15], [-2.7, .45]],
      ];
      for (const outline of continents) {
        const vertices = outline.map(([lon, lat]) => spherical(lon, lat, .131));
        const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).normalize().multiplyScalar(.131);
        const positions = [];
        for (let i = 0; i < vertices.length; i++) {
          positions.push(...center.toArray(), ...vertices[(i + 1) % vertices.length].toArray(), ...vertices[i].toArray());
        }
        // Несколько делений удерживают всю поверхность материков над океаном.
        const curved = [];
        const subdivide = (a, b, c, depth) => {
          if (!depth) {
            curved.push(...a.toArray(), ...b.toArray(), ...c.toArray());
            return;
          }
          const ab = a.clone().add(b).normalize().multiplyScalar(.131);
          const bc = b.clone().add(c).normalize().multiplyScalar(.131);
          const ca = c.clone().add(a).normalize().multiplyScalar(.131);
          subdivide(a, ab, ca, depth - 1);
          subdivide(ab, b, bc, depth - 1);
          subdivide(ca, bc, c, depth - 1);
          subdivide(ab, bc, ca, depth - 1);
        };
        for (let i = 0; i < positions.length; i += 9) {
          subdivide(new THREE.Vector3(...positions.slice(i, i + 3)),
            new THREE.Vector3(...positions.slice(i + 3, i + 6)),
            new THREE.Vector3(...positions.slice(i + 6, i + 9)), 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(curved, 3));
        geometry.computeVertexNormals();
        round(geometry, [0, 0, 0], 0xb6b081, globe);
      }
      for (const latitude of [-.55, 0, .55]) {
        round(new THREE.TorusGeometry(.132 * Math.cos(latitude), .0015, 4, 48),
          [0, .132 * Math.sin(latitude), 0], 0xd5c49a, globe).rotation.x = Math.PI / 2;
      }
    } else if (kind === 'hourglass') {
      const brass = 0xb59b65;
      for (const y of [.0175, .3325]) {
        round(new THREE.CylinderGeometry(.115, .115, .035, 24), [0, y, 0], woodColor, item);
        round(new THREE.TorusGeometry(.103, .005, 6, 24), [0, y + .018, 0], brass, item).rotation.x = Math.PI / 2;
      }
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        rod([Math.cos(angle) * .095, .035, Math.sin(angle) * .095],
          [Math.cos(angle) * .095, .315, Math.sin(angle) * .095], .009, brass, item);
      }
      const profile = [[.055, .04], [.078, .065], [.071, .11], [.028, .16], [.012, .175],
        [.028, .19], [.071, .24], [.078, .285], [.055, .315]].map(([r, y]) => new THREE.Vector2(r, y));
      const glass = round(new THREE.LatheGeometry(profile, 24), [0, 0, 0], 0xc7ded6, item);
      glass.material = new THREE.MeshStandardMaterial({ color: 0xc7ded6, transparent: true,
        opacity: .24, roughness: .1, side: THREE.DoubleSide, depthWrite: false });
      round(new THREE.ConeGeometry(.066, .08, 24), [0, .08, 0], 0xd7bd83, item);
      round(new THREE.ConeGeometry(.06, .055, 24), [0, .265, 0], 0xd7bd83, item).rotation.z = Math.PI;
      rod([0, .12, 0], [0, .239, 0], .003, 0xd7bd83, item);
    } else if (kind === 'compass' || kind === 'pocket-watch') {
      const watch = kind === 'pocket-watch';
      const cx = watch ? -.065 : 0;
      const radius = watch ? .105 : .13;
      round(new THREE.CylinderGeometry(radius, radius, .032, 32), [cx, .016, 0], 0xb59b65, item);
      round(new THREE.CylinderGeometry(radius - .014, radius - .014, .004, 32), [cx, .034, 0], 0xeee1c3, item);
      round(new THREE.TorusGeometry(radius - .006, .006, 8, 32), [cx, .035, 0], 0xd4b97b, item).rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const tick = box([.005, .002, i % 3 ? .012 : .025],
          [cx + Math.sin(angle) * (radius - .032), .038, Math.cos(angle) * (radius - .032)], 0x493e30, item);
        tick.rotation.y = angle;
      }
      if (watch) {
        rod([cx, .04, 0], [cx - .039, .04, -.026], .003, 0x343831, item);
        rod([cx, .04, 0], [cx + .017, .04, -.064], .0025, 0x343831, item);
        round(new THREE.CylinderGeometry(.014, .014, .025, 12), [cx, .018, -.118], 0xb59b65, item).rotation.x = Math.PI / 2;
        round(new THREE.TorusGeometry(.022, .005, 6, 16), [cx, .013, -.151], 0xb59b65, item).rotation.x = Math.PI / 2;
        for (let i = 0; i < 18; i++) {
          const t = i / 17;
          const link = round(new THREE.TorusGeometry(.012, .003, 5, 12),
            [cx + .02 + t * .25, .012, -.155 + .21 * t + .06 * Math.sin(t * Math.PI * 2)], 0xb59b65, item);
          link.rotation.set(Math.PI / 2, i % 2 ? .6 : 0, 0);
        }
      } else {
        paper([[0, -.08], [-.025, 0], [.025, 0]], [cx, .04, 0], 0x934f43, item);
        paper([[0, .08], [.025, 0], [-.025, 0]], [cx, .04, 0], 0x425968, item);
      }
      round(new THREE.SphereGeometry(.008, 8, 6), [cx, .044, 0], 0xb59b65, item);
    } else if (kind === 'candlestick') {
      const brass = 0xb59b65;
      round(new THREE.CylinderGeometry(.105, .12, .025, 24), [0, .0125, 0], brass, item);
      round(new THREE.CylinderGeometry(.018, .037, .15, 16), [0, .1, 0], brass, item);
      for (const y of [.055, .145]) round(new THREE.SphereGeometry(.032, 16, 10), [0, y, 0], brass, item);
      round(new THREE.CylinderGeometry(.055, .03, .032, 24), [0, .19, 0], brass, item);
      round(new THREE.CylinderGeometry(.028, .029, .13, 16), [0, .27, 0], 0xeee1c3, item);
      for (const [x, y] of [[-.024, .299], [.017, .318]]) {
        const drip = round(new THREE.SphereGeometry(1, 10, 8), [x, y, .01], 0xeee1c3, item);
        drip.scale.set(.008, .025, .008);
      }
      rod([0, .335, 0], [0, .352, 0], .003, 0x343831, item);
      const flame = round(new THREE.SphereGeometry(1, 12, 10), [0, .371, 0], 0xeab464, item);
      flame.scale.set(.013, .027, .013);
      flame.material = new THREE.MeshStandardMaterial({ color: 0xeab464, emissive: 0xe69a32, emissiveIntensity: .45 });
    } else if (kind === 'inkwell') {
      softBox([.14, .09, .13], [-.045, .045, .025], 0x354b51, .015, item);
      round(new THREE.CylinderGeometry(.046, .04, .02, 16), [-.045, .1, .025], 0xb59b65, item);
      round(new THREE.CylinderGeometry(.03, .03, .003, 16), [-.045, .112, .025], 0x252d29, item);
      const feather = new THREE.Group();
      feather.position.set(-.045, .11, .025);
      feather.rotation.z = -.4;
      item.add(feather);
      rod([0, 0, 0], [0, .27, 0], .003, 0xb59b65, feather);
      const outline = new THREE.Shape();
      outline.moveTo(0, .065);
      outline.bezierCurveTo(-.085, .13, -.05, .23, 0, .3);
      outline.bezierCurveTo(.063, .22, .06, .13, 0, .065);
      const plume = round(new THREE.ShapeGeometry(outline), [0, 0, .002], 0xeee4cd, feather);
      plume.material.side = THREE.DoubleSide;
      for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
        rod([0, .09 + i * .025, .004], [side * .035 * Math.sin((i + 1) * Math.PI / 9), .12 + i * .025, .004],
          .0015, 0xbdae91, feather);
      }
      round(new THREE.CylinderGeometry(.047, .047, .015, 20), [.085, .008, .05], 0xb59b65, item);
    } else if (kind === 'wax-seal') {
      round(new THREE.CylinderGeometry(.043, .052, .025, 20), [-.065, .0125, -.025], 0xb59b65, item);
      round(new THREE.CylinderGeometry(.018, .025, .045, 12), [-.065, .047, -.025], 0xb59b65, item);
      const handle = round(new THREE.SphereGeometry(1, 16, 12), [-.065, .12, -.025], 0x73553f, item);
      handle.scale.set(.035, .075, .035);
      paper([[-.04, -.07], [.18, -.07], [.18, .12], [-.04, .12]], [0, .002, 0], 0xe2cfad, item);
      round(new THREE.CylinderGeometry(.051, .057, .008, 12), [.085, .006, .02], 0x934f43, item);
      round(new THREE.TorusGeometry(.035, .003, 5, 20), [.085, .012, .02], 0xc17a61, item).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) rod([.065, .013, .02 + side * .019], [.105, .013, .02 - side * .019], .002, 0xc17a61, item);
    } else if (kind === 'antique-phone') {
      const dark = 0x302e29;
      softBox([.35, .075, .27], [0, .0375, 0], dark, .03, item);
      const dial = new THREE.Group();
      dial.position.set(0, .094, .045);
      dial.rotation.x = .2;
      item.add(dial);
      round(new THREE.CylinderGeometry(.086, .086, .012, 32), [0, 0, 0], 0xb59b65, dial);
      round(new THREE.CylinderGeometry(.035, .035, .014, 24), [0, .002, 0], 0xe2cfad, dial);
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI * 2 / 11;
        round(new THREE.CylinderGeometry(.013, .013, .003, 12),
          [Math.sin(angle) * .062, .008, Math.cos(angle) * .062], dark, dial);
      }
      // Держатели касаются нижней поверхности раструбов, не протыкая их.
      for (const x of [-.115, .115]) rod([x, .07, -.07], [x, .124, -.07], .012, 0xb59b65, item);
      tube([[-.14, .164, -.07], [-.095, .195, -.07], [0, .205, -.07], [.095, .195, -.07], [.14, .164, -.07]], .019, dark, item);
      // Широкая горловина закрывает весь срез трубки с небольшим нахлёстом.
      for (const x of [-.14, .14]) round(new THREE.CylinderGeometry(.038, .058, .055, 24), [x, .1495, -.07], dark, item);
      const cord = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96;
        cord.push([.18 + .014 * Math.cos(t * Math.PI * 24), .025 + .125 * t, -.055 + .014 * Math.sin(t * Math.PI * 24)]);
      }
      tube(cord, .004, dark, item);
      rod([.18, .15, -.055], [.14, .175, -.07], .004, dark, item);
    } else if (kind === 'wooden-box') {
      softBox([.32, .13, .23], [0, .065, 0], 0x73553f, .012, item);
      softBox([.34, .036, .25], [0, .148, 0], 0x89674a, .012, item);
      for (const x of [-.12, .12]) {
        box([.012, .003, .23], [x, .1675, 0], 0xb59b65, item);
        box([.012, .12, .004], [x, .065, .117], 0xb59b65, item);
        box([.033, .03, .009], [x, .13, -.124], 0xb59b65, item);
      }
      box([.037, .04, .008], [0, .107, .12], 0xb59b65, item);
      round(new THREE.SphereGeometry(.007, 8, 6), [0, .11, .126], 0x302e29, item);
      for (const z of [-.07, 0, .07]) box([.2, .001, .002], [0, .167, z], 0x605342, item);
    } else if (kind === 'camera') {
      const dark = 0x302e29;
      softBox([.3, .18, .13], [0, .09, -.04], dark, .015, item);
      for (const x of [-.138, .138]) box([.016, .16, .135], [x, .09, -.04], 0xb5b6aa, item);
      for (let i = 0; i < 4; i++) box([.13 + i * .006, .12 + i * .004, .012], [0, .09, .04 + i * .016], i % 2 ? 0x49423a : dark, item);
      round(new THREE.CylinderGeometry(.066, .066, .07, 24), [0, .09, .116], 0xb59b65, item).rotation.x = Math.PI / 2;
      round(new THREE.CylinderGeometry(.052, .052, .004, 24), [0, .09, .153], 0x354b51, item).rotation.x = Math.PI / 2;
      round(new THREE.TorusGeometry(.057, .005, 8, 24), [0, .09, .156], 0xb5b6aa, item);
      box([.075, .035, .045], [0, .195, -.04], dark, item);
      round(new THREE.CylinderGeometry(.02, .02, .012, 12), [.1, .186, -.04], 0xb5b6aa, item);
      tube([[-.155, .13, -.04], [-.205, .04, -.06], [0, .012, -.19], [.205, .04, -.06], [.155, .13, -.04]], .008, 0x73553f, item);
    } else if (kind === 'gramophone') {
      box([.28, .075, .25], [0, .0375, 0], woodColor, item);
      box([.3, .014, .27], [0, .082, 0], 0x89674a, item);
      round(new THREE.CylinderGeometry(.105, .105, .012, 32), [0, .095, .015], 0x302e29, item);
      round(new THREE.CylinderGeometry(.025, .025, .002, 20), [0, .102, .015], 0xbdae91, item);
      for (const radius of [.055, .073, .092]) round(new THREE.TorusGeometry(radius, .001, 4, 32), [0, .102, .015], 0x605342, item).rotation.x = Math.PI / 2;
      // Стойка с шарниром удерживает тонарм над пластинкой.
      round(new THREE.CylinderGeometry(.022, .026, .01, 24), [.116, .094, -.086], 0xb59b65, item);
      rod([.116, .099, -.086], [.116, .148, -.086], .014, 0xb59b65, item);
      round(new THREE.SphereGeometry(.017, 16, 12), [.116, .148, -.086], 0xb59b65, item);
      tube([[.116, .148, -.086], [.114, .161, -.06], [.091, .162, -.026],
        [.065, .151, .014], [.061, .14, .046]], .011, 0xb59b65, item);
      // Вертикальная мембранная головка соединена с концом тонарма сзади.
      const soundbox = new THREE.Group();
      soundbox.position.set(.061, .14, .054);
      soundbox.rotation.x = Math.PI / 2;
      item.add(soundbox);
      round(new THREE.CylinderGeometry(.024, .024, .016, 32), [0, 0, 0], 0xb59b65, soundbox);
      round(new THREE.CylinderGeometry(.018, .018, .002, 24), [0, .009, 0], 0x302e29, soundbox);
      round(new THREE.TorusGeometry(.021, .003, 8, 32), [0, .01, 0], 0xd4b97b, soundbox).rotation.x = Math.PI / 2;
      // Иглодержатель снизу головки; кончик иглы лежит на звуковой дорожке.
      rod([.061, .12, .059], [.064, .113, .065], .004, 0xb59b65, item);
      rod([.064, .113, .065], [.069, .102, .073], .0018, 0xb5b6aa, item);
      tube([[-.09, .09, -.08], [-.09, .17, -.08], [-.04, .195, -.06], [0, .215, -.025]], .02, 0xb59b65, item);
      const horn = new THREE.Group();
      horn.position.set(0, .215, -.025);
      horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(.55, .65, .52).normalize());
      item.add(horn);
      const profile = [[.019, 0], [.026, .04], [.05, .085], [.095, .13], [.145, .16]]
        .map(([r, y]) => new THREE.Vector2(r, y));
      const bell = round(new THREE.LatheGeometry(profile, 32), [0, 0, 0], 0xc3a15c, horn);
      bell.material = new THREE.MeshStandardMaterial({ color: 0xc3a15c, roughness: .4, metalness: .5, side: THREE.DoubleSide });
      round(new THREE.TorusGeometry(.145, .006, 8, 32), [0, .16, 0], 0xd4b97b, horn).rotation.x = Math.PI / 2;
      tube([[.14, .04, .025], [.18, .04, .025], [.18, .04, .095], [.21, .04, .095]], .006, 0xb59b65, item);
      rod([.21, .024, .095], [.21, .057, .095], .01, 0x302e29, item);
    } else if (kind === 'plant') {
      plant(0, 0, true, item);
    } else if (kind === 'succulent') {
      round(new THREE.CylinderGeometry(.12, .1, .12, 10), [0, .06, 0], 0xa88d65, item);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const leaf = round(new THREE.SphereGeometry(1, 8, 6), [Math.cos(angle) * .07, .17, Math.sin(angle) * .07], 0x759477, item);
        leaf.scale.set(.045, .09, .045);
        leaf.rotation.set(Math.sin(angle) * .8, 0, -Math.cos(angle) * .8);
      }
    }
  };
  const smallChair = (style) => {
    const chair = new THREE.Group();
    chair.userData.chair = style;
    group.add(chair);
    const upholstery = style === 'small-chair' ? 0x688277 : 0x9a7661;
    for (const x of [-.15, .15]) for (const z of [-.14, .14]) {
      rod([x, .27, z], [x * 1.12, .022, z * 1.12], .018, woodColor, chair);
    }
    round(new THREE.CylinderGeometry(.225, .225, .035, 24), [0, .2825, 0], woodColor, chair);
    const cushion = round(new THREE.SphereGeometry(1, 24, 12), [0, .307, 0], upholstery, chair);
    cushion.scale.set(.215, .035, .205);
    for (const x of [-.15, .15]) rod([x, .285, -.135], [x, .515, -.16], .018, woodColor, chair);
    if (style === 'small-chair') {
      softBox([.35, .12, .045], [0, .495, -.16], upholstery, .018, chair);
    } else {
      tube([[-.15, .43, -.16], [-.17, .49, -.16], [0, .52, -.16], [.17, .49, -.16], [.15, .43, -.16]], .018, woodColor, chair);
      softBox([.26, .075, .038], [0, .48, -.16], upholstery, .016, chair);
    }
    return chair;
  };
  const compose = (base, count = span) => {
    const choices = [...commonDecorations];
    for (let i = 0; i < count; i++) {
      const index = Math.floor(Math.random() * choices.length);
      // Выбираем без возвращения: даже на длинной поверхности все композиции разные.
      decoration(choices.splice(index, 1)[0], i - (count - 1) / 2, base);
    }
  };

  if (variant === 'decoration') {
    decoration(decorationId, 0, 0);
  } else if (variant === 'bookcase' || variant === 'ladder') {
    const height = 1.9 + Math.random() * .55;
    shelf(height, 4 + Math.floor(Math.random() * 2));
    if (variant === 'ladder') {
      const anchor = new THREE.Group();
      anchor.userData.attachment = 'ladder';
      anchor.position.set(width / 2 - .32, .004, .64);
      group.add(anchor);
      const ladder = new THREE.Group();
      const ladderHeight = height - .1;
      // Низ выступает перед стеллажом, верх опирается на внешний край полок.
      ladder.rotation.x = -Math.asin(.145 / ladderHeight);
      anchor.add(ladder);
      for (const x of [-.19, .19]) box([.045, ladderHeight, .05], [x, ladderHeight / 2, 0], 0xa1875c, ladder);
      for (let y = .15; y < ladderHeight; y += .25) box([.4, .035, .075], [0, y, .012], 0xa1875c, ladder);
    }
  } else if (variant === 'files') {
    const rows = 3 + Math.floor(Math.random() * 3);
    const height = .14 + rows * .3;
    box([width, height, .68], [0, height / 2, 0], 0x536058);
    for (let column = 0; column < span * 2; column++) for (let row = 0; row < rows; row++) {
      const x = (column + .5) * width / (span * 2) - width / 2;
      const y = .14 + (row + .5) * .3;
      box([width / (span * 2) - .045, .265, .022], [x, y, .35], 0x697568);
      box([.17, .055, .012], [x, y + .055, .368], 0xddceb0);
      box([.13, .027, .035], [x, y - .045, .38], 0xb69b62);
    }
    box([width + .02, .06, .72], [0, height + .03, 0]);
    if (span > 2) compose(height + .06);
  } else if (variant === 'floor-lamp') {
    // IC Lights: тонкая латунная стойка и опаловый шар на коротком плече.
    round(new THREE.CylinderGeometry(sceneConfig.floorLampBaseRadius, sceneConfig.floorLampBaseRadius, .035, 48), [0, .0175, 0], 0x444942);
    rod([-.13, .035, 0], [-.13, 1.43, 0], .013, 0xb59b65);
    rod([-.13, 1.43, 0], [.055, 1.43, 0], .013, 0xb59b65);
    const globe = glowing(round(new THREE.SphereGeometry(.185, 40, 24), [.055, 1.245, 0], 0xf4ead8), .3);
    globe.userData.lampPart = 'globe';
  } else if (variant === 'floor-lamp-classic') {
    // Старый торшер с коническим абажуром остаётся самостоятельным вариантом.
    round(new THREE.CylinderGeometry(.21, .24, .055, 12), [0, .0275, 0], 0x3f4941);
    round(new THREE.CylinderGeometry(.025, .025, 1.47, 8), [0, .735, 0], 0xb59b65);
    const shade = round(new THREE.CylinderGeometry(.14, .3, .25, 12, 1, true), [0, 1.525, 0], 0xd9c496);
    shade.material.side = THREE.DoubleSide;
    glowing(round(new THREE.SphereGeometry(.07, 8, 6), [0, 1.47, 0], 0xffdea0), .65);
  } else if (variant === 'armchair') {
    feet(.78, .72, .16);
    box([.77, .24, .7], [0, .28, 0], 0x3f625c);
    box([.61, .14, .56], [0, .45, .045], 0x688277);
    box([.77, .65, .16], [0, .665, -.27], 0x3f625c);
    box([.59, .43, .08], [0, .7, -.175], 0x688277);
    for (const x of [-.34, .34]) box([.13, .28, .66], [x, .5, 0], 0x3f625c);
  } else if (variant === 'plant') {
    plant(0, 0);
  } else if (variant === 'low-shelf') {
    // Это открытый горизонтальный книжный модуль, а не сплющенный стеллаж.
    shelf(.38, 1, .205);
    compose(.4275, 1);
  } else if (['bench', 'bench-back', 'bench-arms', 'bench-spindles'].includes(variant)) {
    const end = width / 2 - .055;
    const timber = 0x96704d;
    // Тонкие ножки, открытый каркас и зазоры между досками дают силуэт скамьи.
    for (const x of [-end, end]) {
      for (const z of [-.255, .255]) softBox([.065, .29, .065], [x, .145, z], woodColor, .009);
      softBox([.07, .05, .59], [x, .255, 0], woodColor, .009);
    }
    // Продольная царга соединяется с поперечинами, которые доходят до ножек.
    for (const x of [-end, end]) softBox([.065, .045, .55], [x, .15, 0], woodColor, .008);
    softBox([width - .11, .045, .045], [0, .15, 0], woodColor, .008);
    for (let i = 0; i < 4; i++) softBox([width, .045, .14], [0, .2975, (i - 1.5) * .163], timber, .012);
    const back = variant === 'bench-back' || variant === 'bench-spindles';
    const arms = variant === 'bench-arms' || variant === 'bench-spindles';
    if (back) {
      for (const x of [-end, end]) softBox([.055, .29, .055], [x, .405, -.285], woodColor, .009);
      if (variant === 'bench-back') {
        for (const y of [.4, .52]) softBox([width, .075, .045], [0, y, -.292], timber, .012);
      } else {
        softBox([width, .045, .065], [0, .53, -.285], timber, .016);
        softBox([width - .1, .035, .04], [0, .35, -.285], timber, .009);
        const count = span * 5;
        for (let i = 1; i < count; i++) round(new THREE.CylinderGeometry(.014, .014, .16, 8),
          [-end + i * 2 * end / count, .43, -.285], woodColor);
      }
    }
    if (arms) for (const x of [-end, end]) {
      for (const z of [-.255, .255]) softBox([.045, .16, .045], [x, .39, z], woodColor, .008);
      softBox([.085, .045, .64], [x, .4825, 0], timber, .016);
    }
    compose(.32);
    for (const item of group.children.filter((child) => child.userData.decoration)) item.position.z = .07;
  } else if (variant === 'ottoman') {
    for (const x of [-.29, .29]) for (const z of [-.25, .25])
      round(new THREE.CylinderGeometry(.038, .03, .075, 10), [x, .0375, z], woodColor);
    softBox([.81, .245, .72], [0, .1925, 0], 0x75617a, .075);
    softBox([.835, .026, .745], [0, .316, 0], 0xc0a1b0, .012);
    softBox([.85, .1, .76], [0, .368, 0], 0x978091, .045);
    compose(.418);
  } else if (variant === 'planter') {
    for (let i = 0; i < span; i++) gueridon(i % 2 ? 'pedestal' : 'tripod', i - (span - 1) / 2, .3);
    compose(.3);
  } else if (variant === 'reading-lamp') {
    // Тонкая столешница и лёгкая тренога вместо широкого точёного основания.
    const radius = sceneConfig.readingLampTableRadius;
    round(new THREE.CylinderGeometry(radius, radius, .025, 40), [0, .2875, 0], woodColor);
    rod([0, .055, 0], [0, .275, 0], .021);
    for (let i = 0; i < 3; i++) {
      const angle = Math.PI / 2 + i * Math.PI * 2 / 3;
      rod([0, .1, 0], [Math.cos(angle) * radius * .82, .035, Math.sin(angle) * radius * .82], .016);
    }
    readingLamp(.3);
  } else if (variant === 'gueridon-tripod' || variant === 'gueridon-pedestal') {
    gueridon(variant === 'gueridon-tripod' ? 'tripod' : 'pedestal', 0, .36, sceneConfig.gueridonRadius);
    compose(.36);
  } else if (variant === 'coffee-table') {
    const table = scene.createObstacle('coffee-table', span);
    table.scale.y = .65;
    group.add(table);
  } else if (variant === 'round-coffee-table') {
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      rod([Math.cos(angle) * .23, .28, Math.sin(angle) * .23],
        [Math.cos(angle) * .29, .032, Math.sin(angle) * .29], .028);
    }
    round(new THREE.CylinderGeometry(.25, .25, .025, 32), [0, .12, 0], woodColor);
    round(new THREE.CylinderGeometry(.39, .39, .05, 40), [0, .305, 0], woodColor);
    compose(.33);
  } else if (variant === 'round-cafe-table') {
    gueridon('pedestal', 0, .48, .35);
    compose(.48, 1);
    const count = sceneConfig.cafeTableChairCount;
    const turnedChairs = Math.random() < .5 ? 1 : 2;
    const firstSide = Math.random() < .5 ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? firstSide : -firstSide;
      const chair = smallChair(Math.random() < .5 ? 'small-chair' : 'small-chair-round');
      chair.position.x = side * .62;
      const turn = i < turnedChairs ? THREE.MathUtils.degToRad(sceneConfig.cafeTableChairAngle) : 0;
      chair.rotation.y = -side * (Math.PI / 2 - turn);
      chair.userData.tableAngle = turn;
    }
  } else if (variant === 'small-chair' || variant === 'small-chair-round') {
    const chair = smallChair(variant);
    chair.rotation.y = Math.random() < .5 ? 0 : Math.PI;
    if (Math.random() < sceneConfig.chairDecorationChance) {
      compose(.342);
      // Предмет остаётся перед спинкой при любом развороте стула.
      group.children.at(-1).position.z = Math.cos(chair.rotation.y) * .035;
    }
  } else if (variant === 'reading-table') {
    feet(width - .12, .52, .32);
    box([width - .18, .045, .045], [0, .17, 0]);
    const desktop = new THREE.Group();
    desktop.position.y = .4;
    desktop.rotation.x = .2;
    group.add(desktop);
    box([width, .045, .65], [0, 0, 0], woodColor, desktop);
    box([width - .08, .025, .025], [0, .035, .3], 0xb59b65, desktop);
    for (let i = 0; i < span; i++) {
      const stand = new THREE.Group();
      stand.position.set(i - (span - 1) / 2, .025, 0);
      stand.rotation.x = i % 2 ? .12 : 0;
      desktop.add(stand);
      if (i % 2) {
        box([.48, .025, .32], [0, .008, 0], woodColor, stand);
        rod([-.18, -.025, -.12], [-.18, .005, -.12], .012, woodColor, stand);
        rod([.18, -.025, -.12], [.18, .005, -.12], .012, woodColor, stand);
      }
      // Две страницы и корешок образуют раскрытый том.
      for (const side of [-1, 1]) {
        const page = new THREE.Group();
        page.position.set(side * .115, .028, 0);
        page.rotation.z = side * .08;
        stand.add(page);
        box([.23, .012, .3], [0, -.008, 0], palette[i % palette.length], page);
        box([.215, .018, .28], [0, .007, 0], 0xe8dcc0, page);
        for (let line = 0; line < 6; line++) {
          box([.15, .001, .003], [0, .017, -.095 + line * .035], 0x9c927b, page);
        }
      }
      box([.016, .022, .29], [0, .021, 0], 0xc5b99c, stand);
    }
  } else if (variant === 'periodicals-rack') {
    const height = .55;
    for (const x of [-width / 2 + .035, width / 2 - .035]) {
      box([.07, height, .5], [x, height / 2, -.035]);
    }
    box([width, .055, .56], [0, .0275, 0]);
    for (const y of [.18, .4]) {
      const tray = new THREE.Group();
      tray.position.set(0, y, .035);
      tray.rotation.x = .65;
      group.add(tray);
      box([width - .12, .025, .31], [0, 0, 0], woodColor, tray);
      box([width - .12, .035, .025], [0, .027, .15], 0xb59b65, tray);
      for (let i = 0; i < span * 3; i++) {
        const x = (i + .5) * (width - .2) / (span * 3) - (width - .2) / 2;
        const newspaper = i % 3 === 0;
        const w = (width - .25) / (span * 3);
        const depth = newspaper ? .26 : i % 3 === 1 ? .23 : .2;
        box([w, .018, depth], [x, .025, .015], newspaper ? 0xdcd1b5 : palette[i % palette.length], tray);
        box([w * .76, .002, .022], [x, .035, -.06], newspaper ? 0x60594d : 0xe8dcc0, tray);
        for (let line = 0; line < 4; line++) {
          box([w * .72, .002, .003], [x, .035, -.02 + line * .027], newspaper ? 0x9c927b : 0xc5b99c, tray);
        }
      }
    }
  } else if (variant === 'floor-planter') {
    const single = Math.random() < .5;
    const planterWidth = width;
    softBox([planterWidth, .22, .56], [0, .11, 0], 0x9e7055, .025);
    box([planterWidth - .065, .02, .49], [0, .22, 0], 0x413b2c);
    for (const z of [-.275, .275]) box([planterWidth, .035, .025], [0, .225, z], 0xc09973);
    for (let i = 0; i < (single ? 1 : span * 2); i++) {
      const x = single ? 0 : (i + .5) * (width - .22) / (span * 2) - (width - .22) / 2;
      rod([x, .23, 0], [x, .43, 0], .009, 0x3f6350);
      for (let leaf = 0; leaf < 7; leaf++) {
        const angle = leaf * Math.PI * 2 / 7;
        const mesh = round(new THREE.SphereGeometry(1, 16, 12),
          [x + Math.cos(angle) * .08, .37, Math.sin(angle) * .12],
          leaf % 2 ? 0x5c7951 : 0x3f6350);
        mesh.scale.set(.055, .15, .04);
        mesh.rotation.set(Math.sin(angle) * .55, 0, -Math.cos(angle) * .55);
      }
    }
  } else if (variant === 'storage-chest') {
    feet(width - .08, .59, .07);
    softBox([width - .04, .31, .65], [0, .225, 0], woodColor, .025);
    softBox([width, .07, .69], [0, .415, 0], 0x89674a, .018);
    for (const x of [-width * .34, width * .34]) {
      box([.045, .3, .016], [x, .23, .33], 0xb59b65);
      box([.045, .009, .66], [x, .4545, 0], 0xb59b65);
      box([.075, .05, .016], [x, .395, -.35], 0xb59b65);
    }
    box([.1, .075, .022], [0, .365, .34], 0xb59b65);
    round(new THREE.SphereGeometry(.01, 12, 8), [0, .36, .357], 0x302e29);
    for (const x of [-width / 2 + .035, width / 2 - .035]) {
      rod([x, .21, -.085], [x, .21, .085], .013, 0xb59b65);
      for (const z of [-.085, .085]) rod([x, .21, z], [x, .25, z], .01, 0xb59b65);
    }
    compose(.45, 1);
  } else if (variant === 'sideboard') {
    feet(width, .62, .12);
    box([width, .55, .65], [0, .395, 0]);
    for (let i = 0; i < span; i++) {
      const x = i - (span - 1) / 2;
      box([.84, .43, .025], [x, .395, .3375], 0x4e5447);
      box([.14, .025, .025], [x, .42, .363], 0xc5a469);
    }
    box([width + .02, .07, .7], [0, .705, 0]);
    compose(.74);
  } else if (['flowers', 'desk-lamp', 'statuette'].includes(variant)) {
    compose(gueridon(variant === 'desk-lamp' ? 'pedestal' : 'tripod'));
  }
  if (variant !== 'decoration') {
    // Как у внутренних преград: заполняем плитки с зазором .03 с каждой стороны.
    // Высоту сохраняем, чтобы передняя мебель не заслоняла игровое поле.
    const bounds = new THREE.Box3();
    for (const part of group.children.filter((child) => !child.userData.decoration && !child.userData.attachment)) {
      bounds.union(new THREE.Box3().setFromObject(part));
    }
    const narrowStand = variant.startsWith('gueridon-');
    const halfWidth = narrowStand ? sceneConfig.gueridonRadius : variant.startsWith('small-chair') ? .3 : (span - .06) / 2;
    const halfDepth = narrowStand ? sceneConfig.gueridonRadius : variant.startsWith('small-chair') ? .3 : .47;
    const preserveSize = ['reading-lamp', 'floor-lamp', 'floor-lamp-classic',
      'small-chair', 'small-chair-round', 'round-coffee-table'].includes(variant);
    const fitX = halfWidth / Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    const fitZ = halfDepth / Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
    if (variant === 'round-cafe-table') {
      // Уменьшаем тесный комплект целиком: стол остаётся круглым, стулья сохраняют пропорции.
      group.scale.setScalar(Math.min(1, fitX, fitZ));
    } else {
      group.scale.x = preserveSize ? 1 : fitX;
      group.scale.z = preserveSize ? 1 : fitZ;
    }
    // Опаловый шар сохраняет сферическую форму при подгонке основания к клетке.
    for (const part of group.children.filter((child) => child.userData.lampPart === 'globe')) {
      part.scale.set(1 / group.scale.x, 1, 1 / group.scale.z);
    }
    // Доля толщины корешка сохраняется после масштабирования мебели.
    for (const { mesh, thickness } of insetBooks) {
      mesh.position.z -= thickness * sceneConfig.lowShelfBookInset * group.scale.x / group.scale.z;
    }
    for (const item of group.children.filter((child) => child.userData.attachment)) {
      item.position.z /= group.scale.z;
      item.scale.set(1 / group.scale.x, 1, 1 / group.scale.z);
    }
  }
  for (const item of group.children.filter((child) => child.userData.decoration)) {
    // Компенсация до поворота предмета сохраняет пропорции даже при разных масштабах X и Z.
    const scale = sceneConfig.decorationScale;
    item.scale.set(scale / group.scale.x, scale / group.scale.y, scale / group.scale.z);
    if (variant.startsWith('bench')) {
      // Очки имеют небольшой зазор в исходной модели; на скамье опускаем их до сиденья.
      group.updateMatrixWorld(true);
      const bottom = new THREE.Box3().setFromObject(item).min.y;
      item.position.y += (.32 - bottom) / group.scale.y;
    }
  }
  return group;
}
