import * as THREE from 'three';
import { createPushkinPortrait } from './pushkin-portrait.js';
import { addStoneSurface } from './chest-stone.js';
import { sceneConfig } from './config.js';
import { obstacleModels } from './model-registry.js';

// Геометрия и начальные позы не зависят от DOM, WebGL и игровой комнаты.
export class ModelFactory {
  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
  }

  block(parent, dimensions, position, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.position.set(...position);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  createMovableChest() {
    const group = new THREE.Group();
    const body = this.material(0x793747);
    const metal = this.material(0xd1b577, { metalness: .7, roughness: .32 });
    const dark = this.material(0x302e32, { metalness: .5, roughness: .48 });
    const seam = this.material(0x492735);
    const interior = this.material(0x322231);
    this.block(group, [.54, .04, .54], [0, .125, 0], interior).name = 'chest-floor';
    for (const z of [-.295, .295]) this.block(group, [.64, .375, .05], [0, .2925, z], body);
    for (const x of [-.295, .295]) this.block(group, [.05, .375, .54], [x, .2925, 0], body);
    const lid = new THREE.Group();
    lid.position.set(0, .495, -.20);
    group.add(lid);
    const lidDetails = new THREE.Group();
    lidDetails.position.set(0, -.495, .20);
    lid.add(lidDetails);

    // Крышка и её пояса имеют один округлый профиль, вытянутый вдоль X.
    const arch = (width, base, rise, depth, material, x, hollow = true, thickness = .018) => {
      const shape = new THREE.Shape();
      shape.moveTo(width / 2, base);
      for (let i = 0; i <= 32; i++) {
        const angle = i * Math.PI / 32;
        shape.lineTo(Math.cos(angle) * width / 2, base + Math.sin(angle) * rise);
      }
      if (hollow) {
        for (let i = 32; i >= 0; i--) {
          const angle = i * Math.PI / 32;
          shape.lineTo(Math.cos(angle) * (width / 2 - thickness), base + Math.sin(angle) * (rise - thickness));
        }
      } else shape.lineTo(-width / 2, base);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
      geometry.translate(0, 0, -depth / 2);
      geometry.rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = x;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      lidDetails.add(mesh);
    };
    arch(.64, .495, .18, .64, body, 0);
    arch(.603, .495, .161, .598, interior, 0, true, .004);
    for (const x of [-.31, .31]) arch(.64, .495, .18, .02, body, x, false);
    for (const x of [-.297, .297]) arch(.603, .495, .161, .005, interior, x, false);
    // Только обод по четырём стенкам: середина остаётся открытой.
    for (const z of [-.295, .295]) this.block(group, [.64, .018, .05], [0, .487, z], seam);
    for (const x of [-.295, .295]) this.block(group, [.05, .018, .54], [x, .487, 0], seam);
    for (const z of [-.267, .267]) this.block(group, [.54, .33, .006], [0, .3, z], interior);
    for (const x of [-.267, .267]) this.block(group, [.006, .33, .54], [x, .3, 0], interior);
    // Узкий нижний кант охватывает стенки, не образуя отдельного поддона.
    for (const z of [-.32, .32]) this.block(group, [.65, .035, .018], [0, .1225, z], metal);
    for (const x of [-.32, .32]) this.block(group, [.018, .035, .62], [x, .1225, 0], metal);
    for (const x of [-.22, .22]) {
      arch(.665, .497, .19, .045, metal, x, true, .015);
      for (const z of [-.329, .329]) {
        this.block(group, [.045, .34, .022], [x, .31, z], metal);
        for (const y of [.12, .28, .43]) {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), dark);
          rivet.position.set(x, y, z * 1.035);
          group.add(rivet);
        }
      }
    }
    for (const x of [-.305, .305]) for (const z of [-.305, .305]) {
      this.block(group, [.05, .035, .05], [x, .1225, z], metal);
    }
    for (const x of [-.335, .335]) {
      this.block(group, [.025, .09, .19], [x, .34, 0], metal);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(.075, .013, 8, 20, Math.PI), dark);
      handle.rotation.y = Math.PI / 2;
      handle.rotation.z = Math.PI;
      handle.position.set(x * 1.06, .35, 0);
      handle.castShadow = true;
      group.add(handle);
    }
    // Накладка пересекает шов крышки, под ней висит отдельный замок.
    this.block(lidDetails, [.075, .15, .025], [0, .485, .341], metal);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(.037, .009, 8, 16, Math.PI), dark);
    shackle.position.set(0, .417, .345);
    lidDetails.add(shackle);
    this.block(lidDetails, [.105, .09, .038], [0, .373, .342], metal);
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(.012, 12), dark);
    keyhole.position.set(0, .383, .362);
    lidDetails.add(keyhole);
    this.block(lidDetails, [.012, .023, .003], [0, .368, .363], dark, false);
    for (const x of [-.22, .22]) {
      this.block(group, [.1, .08, .03], [x, .465, -.20], metal);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .11, 12), metal);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(x, .495, -.20);
      group.add(hinge);
    }
    const books = new THREE.Group();
    group.add(books);
    const pages = this.material(0xeee1b6);
    const colors = [0x4a5942, 0x744535, 0x4b3c32, 0x9a8054, 0x54616a];
    colors.forEach((color, index) => {
      const book = new THREE.Group();
      const cover = this.material(color);
      const height = .42 + Math.random() * .07;
      const depth = .30 + Math.random() * .03;
      // Книги стоят на нижнем обрезе; корешки обращены к передней стороне сундука.
      this.block(book, [.066, height - .018, depth - .02], [0, height / 2, 0], pages);
      for (const x of [-.039, .039]) this.block(book, [.012, height, depth], [x, height / 2, 0], cover);
      this.block(book, [.09, height, .016], [0, height / 2, depth / 2 - .006], cover);
      if (index % 2 === 0) this.block(book, [.045, .038, .004], [0, height * .64, depth / 2 + .004], pages, false);
      book.rotation.x = THREE.MathUtils.degToRad((Math.random() - .5) * 10);
      book.position.set((index - 2) * .099, 0, (Math.random() - .5) * .045);
      books.add(book);
    });
    const bookTop = new THREE.Box3().setFromObject(books).max.y;
    // Нижний край корпуса в локальном нуле; в игре опирается на верх плитки.
    group.children.forEach((child) => { child.position.y -= .105; });
    group.scale.setScalar(1.27);
    group.userData.groundOffset = .02;
    group.userData.bodyMaterial = body;
    group.updateMatrixWorld(true);
    const chestInverse = group.matrixWorld.clone().invert();
    const stoneMaterials = new Set([body, metal, dark, seam, interior]);
    group.traverse((mesh) => {
      if (!mesh.isMesh || !stoneMaterials.has(mesh.material)) return;
      const positions = mesh.geometry.attributes.position;
      const stonePositions = new Float32Array(positions.count * 3);
      const transform = chestInverse.clone().multiply(mesh.matrixWorld);
      const point = new THREE.Vector3();
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(transform).toArray(stonePositions, index * 3);
      }
      mesh.geometry.setAttribute('stonePosition', new THREE.BufferAttribute(stonePositions, 3));
    });
    group.userData.chest = { lid, books, materials: [body, metal, dark, seam, interior], bookRise: .675 - .14 - bookTop, progress: 0, target: 0, transition: null,
      stoneProgress: 0, stoneTarget: 0, stoneTransition: null,
      mossProgress: 0, mossTarget: 0, mossTransition: null,
      stoneUniforms: addStoneSurface([body, metal, dark, seam, interior], (group.id * .61803398875) % 100),
      baseSurfaces: [body, metal, dark, seam, interior].map(({ roughness, metalness }) => ({ roughness, metalness })),
      baseColors: [body, metal, dark, seam, interior].map((material) => material.color.clone()) };
    this.setChestProgress(group, 0);
    return group;
  }

  setChestProgress(chest, progress) {
    const data = chest.userData.chest;
    data.progress = progress;
    data.lid.rotation.x = -THREE.MathUtils.degToRad(88) * progress;
    data.books.position.y = .035 + data.bookRise * progress;
    data.books.visible = progress > 0;
    data.stoneUniforms.chestStone.value = data.stoneProgress;
    data.stoneUniforms.chestMoss.value = data.mossProgress;
    data.materials.forEach((material, index) => {
      material.color.copy(data.baseColors[index]).lerp(new THREE.Color(index === 4 ? 0x987137 : index === 2 ? 0x9a712c : 0xf4c85b), progress);
      material.emissive.set(0xffbd39);
      material.emissiveIntensity = progress * (index === 4 ? .08 : index === 0 ? .45 : .2);
      const stone = data.stoneProgress;
      material.color.lerp(new THREE.Color(index === 0 ? 0x82878c : index === 4 ? 0x545b61 : 0x696f76), stone);
      material.emissiveIntensity *= 1 - stone;
      material.roughness = THREE.MathUtils.lerp(data.baseSurfaces[index].roughness, 1, stone);
      material.metalness = data.baseSurfaces[index].metalness * (1 - stone);
    });
  }

  createGoalSeal() {
    const seal = new THREE.Group();
    const author = 'pushkin';
    const ink = this.material(0xdcb768, { emissive: 0xffbc32, emissiveIntensity: 1.05, roughness: .4 });
    for (const radius of [.435, .385]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius === .435 ? .018 : .006, 8, 96), ink);
      ring.rotation.x = -Math.PI / 2;
      seal.add(ring);
    }
    seal.add(createPushkinPortrait(ink));

    // Общая текстура света затухает к краям и к верху, без острого кончика.
    const pixels = new Uint8Array(32 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const offset = (y * 32 + x) * 4;
      const edge = Math.sin(Math.PI * x / 31) ** 2;
      const fade = Math.sin(Math.PI * y / 63) * (1 - y / 63);
      pixels.set([255, 225, 156, Math.round(255 * edge * fade)], offset);
    }
    const glow = new THREE.DataTexture(pixels, 32, 64);
    glow.needsUpdate = true;
    const rayMaterial = new THREE.MeshBasicMaterial({ map: glow, color: 0xffd779, transparent: true,
      opacity: .55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const rays = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const height = .20 + (i % 3) * .065;
      const material = i === 0 ? rayMaterial : rayMaterial.clone();
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(.09, height), material);
      const angle = i * Math.PI / 5;
      ray.position.set(Math.cos(angle) * .425, height / 2, Math.sin(angle) * .425);
      ray.rotation.y = -angle;
      ray.userData = { height, phase: i * 2.4, baseX: ray.position.x, baseZ: ray.position.z };
      rays.add(ray);
    }
    seal.add(rays);
    seal.userData = { ink, rays, rayMaterial, author, occupied: false };
    return seal;
  }

  createPlayer() {
    this.player = new THREE.Group();
    this.rig = new THREE.Group();
    this.player.add(this.rig);
    const coat = this.material(0x3c7776);
    const skin = this.material(0xe3c69b);
    const dark = this.material(0x283d3a);
    this.block(this.rig, [.32, .39, .27], [0, .42, 0], coat);
    const limb = (x, y, dimensions, material) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      this.rig.add(pivot);
      this.block(pivot, dimensions, [0, -dimensions[1] / 2, 0], material);
      return pivot;
    };
    this.legs = [-.1, .1].map((x) => limb(x, .25, [.11, .2, .18], dark));
    this.arms = [-.23, .23].map((x) => {
      const arm = limb(x, .58, [.1, .24, .12], coat);
      this.block(arm, [.105, .09, .12], [0, -.28, 0], skin);
      return arm;
    });
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = .68;
    this.rig.add(this.headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 16, 12), skin);
    head.position.y = .08;
    head.castShadow = true;
    this.headPivot.add(head);
    this.block(this.headPivot, [.045, .05, .055], [0, .065, .15], skin);
    for (const x of [-.055, .055]) {
      this.block(this.headPivot, [.022, .025, .02], [x, .105, .135], dark, false);
    }
    this.hatPivot = new THREE.Group();
    this.hatPivot.position.y = .16;
    this.headPivot.add(this.hatPivot);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .08, 20), dark);
    hat.position.y = .03;
    hat.castShadow = true;
    this.hatPivot.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .03, 20), dark);
    this.hatPivot.add(brim);
    this.addHatFeather();
    this.player.userData.groundOffset = -.03;
    return this.player;
  }

  createObstacle(variant, span = 1) {
    const entry = obstacleModels.find((model) => model.id === variant);
    if (!entry) throw new Error(`Неизвестная преграда: ${variant}`);
    if (!Number.isInteger(span) || span < 1 || span > (entry.maxSpan ?? 1)) {
      throw new Error('Недопустимая длина модели');
    }
    const group = new THREE.Group();
    group.userData.variant = variant;
    group.userData.span = span;
    const rotation = span > 1 ? 0 : Math.floor(Math.random() * 4) * Math.PI / 2;
    const palette = [0x526d65, 0x8a4f43, 0xb29255, 0x435767, 0x75617b];
    const covers = new Map();
    const pages = this.material(0xe5d7b8);
    const gilding = this.material(0xc5a469);
    const colorOffset = Math.floor(Math.random() * palette.length);
    let bookIndex = 0;
    let uprightTopBook;
    // Книга лежит плашмя: обложки, светлый блок страниц и отдельный корешок.
    const book = (parent, width, thickness, depth, position, yaw = 0, upright = false) => {
      const volume = new THREE.Group();
      volume.position.set(...position);
      volume.rotation.set(0, yaw, upright ? Math.PI / 2 : 0);
      parent.add(volume);
      const color = palette[(colorOffset + bookIndex++) % palette.length];
      if (!covers.has(color)) covers.set(color, this.material(color));
      const cover = covers.get(color);
      this.block(volume, [width - .025, thickness - .024, depth - .035], [0, 0, .006], pages);
      for (const y of [-1, 1]) {
        this.block(volume, [width, .012, depth], [0, y * (thickness - .012) / 2, 0], cover);
      }
      this.block(volume, [width, thickness, .025], [0, 0, -depth / 2 + .0125], cover);
      for (const x of [-width * .32, width * .32]) {
        this.block(volume, [.013, thickness * .65, .003], [x, 0, -depth / 2 - .001], gilding, false);
      }
      return volume;
    };
    const stack = (parent, count, base, width = .59, depth = .43) => {
      let height = base;
      for (let i = 0; i < count; i++) {
        const thickness = .09 + Math.random() * .035;
        const size = 1 - i * .055;
        book(parent, width * size, thickness, depth * size,
          [(Math.random() - .5) * .045, height + thickness / 2, (Math.random() - .5) * .045],
          (Math.random() - .5) * .28);
        height += thickness;
      }
    };
    if (variant === 'stack') {
      if (span === 1) stack(group, 5 + Math.floor(Math.random() * 2), 0);
      else for (let i = 0; i < 3; i++) {
        const pile = new THREE.Group();
        pile.position.set((i - 1) * .62, 0, i === 1 ? .055 : -.035);
        group.add(pile);
        stack(pile, 3 + Math.floor(Math.random() * 2), 0);
      }
    } else if (variant === 'upright' || variant === 'upright-no-frame') {
      const framed = variant === 'upright';
      const length = .74 + (span - 1) * .92;
      const base = framed ? .045 : 0;
      if (framed) {
        const wood = this.material(0x72543c);
        this.block(group, [length, .045, .56], [0, .0225, 0], wood);
        for (const x of [-length / 2 + .03, length / 2 - .03]) {
          this.block(group, [.035, .28, .48], [x, .185, 0], wood);
        }
      }
      let tallest = 0;
      const count = span === 1 ? 5 : 13;
      for (let i = 0; i < count; i++) {
        const height = span === 1 ? .43 + Math.random() * .13 : .34 + Math.random() * .1;
        tallest = Math.max(tallest, height);
        book(group, height, .105, .41, [(i - (count - 1) / 2) * .117, base + height / 2, 0], 0, true);
      }
      uprightTopBook = book(group, .3, .08, .44, [0, base + .04 + tallest, 0]);
    } else if (variant === 'pyramid') {
      for (let row = 0; row < 3; row++) {
        const count = 3 - row;
        for (let i = 0; i < count; i++) {
          book(group, .245, .145, .49 - row * .035,
            [(i - (count - 1) / 2) * .255, .0725 + row * .145, 0]);
        }
      }
      book(group, .36, .085, .32, [0, .4775, 0], .12);
    } else {
      const wood = this.material(Math.random() < .5 ? 0x79583e : 0x5f5140);
      if (variant === 'coffee-table') {
        const length = .76 + (span - 1) * .8;
        for (const x of [-length / 2 + .11, length / 2 - .11]) for (const z of [-.21, .21]) {
          this.block(group, [.075, .4, .075], [x, .2, z], wood);
        }
        this.block(group, [length - .13, .045, .49], [0, .15, 0], wood);
        this.block(group, [length, .075, .62], [0, .4375, 0], wood);
        book(group, .36, .07, .29, [.08, .2075, .02], -.1);
        book(group, .58, .045, .44, [0, .4975, 0], .1);
        stack(group, 2, .52, .42, .32);
        if (span > 1) {
          book(group, .4, .055, .3, [-length * .3, .5025, .05], -.16);
          book(group, .38, .05, .28, [length * .3, .1775, .02], .12);
        }
      } else {
        const inset = this.material(0x423d32);
        for (const x of [-.23, .23]) for (const z of [-.18, .18]) {
          this.block(group, [.07, .12, .07], [x, .06, z], wood);
        }
        this.block(group, [.58, .36, .46], [0, .29, 0], wood);
        for (const y of [.21, .38]) {
          this.block(group, [.49, .13, .018], [0, y, .24], inset);
          this.block(group, [.12, .025, .025], [0, y, .26], gilding);
        }
        this.block(group, [.66, .065, .54], [0, .5025, 0], wood);
        stack(group, 2, .535, .44, .33);
      }
    }
    // Подгоняем силуэт к выделенным плиткам, оставляя небольшой зазор по краям.
    // Высоту сохраняем, чтобы увеличенная преграда не заслоняла соседние клетки.
    const bounds = new THREE.Box3().setFromObject(group);
    group.scale.x = (span - .06) / 2 / Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    group.scale.z = .47 / Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
    if (uprightTopBook) {
      // Узкая сторона обложки составляет 2/3 длинной даже после подгонки к клеткам.
      // Меняем только ширину: глубина и толщина верхней книги сохраняются.
      uprightTopBook.scale.x = (.44 * group.scale.z * 2 / 3) / (.3 * group.scale.x);
    }
    group.rotation.y = rotation;
    return group;
  }

  addHatFeather() {
    // Светлое асимметричное перо делает силуэт шляпы читаемым при поворотах.
    this.feather = new THREE.Group();
    this.feather.position.set(-.16, .03, -.025);
    // Перед героя — +Z: перо уходит к затылку и немного вбок.
    // Боковое крепление вдохновлено историческими шляпами с перьями;
    // угол назад выбран для читаемости направления в игровом ракурсе.
    this.feather.rotation.set(THREE.MathUtils.degToRad(-24), .45, .22);
    this.hatPivot.add(this.feather);
    const outline = new THREE.Shape();
    outline.moveTo(0, .075);
    outline.quadraticCurveTo(-.09, .14, -.095, .25);
    outline.lineTo(-.055, .27);
    outline.lineTo(-.09, .29);
    outline.quadraticCurveTo(-.08, .43, .09, .55);
    outline.quadraticCurveTo(.15, .44, .14, .36);
    outline.lineTo(.1, .34);
    outline.lineTo(.145, .325);
    outline.quadraticCurveTo(.14, .18, .025, .075);
    outline.closePath();
    const vane = new THREE.Mesh(
      this.subdivideFeather(new THREE.ExtrudeGeometry(outline, { depth: .014, bevelEnabled: false, curveSegments: 8 })),
      this.material(0xf1e4c9),
    );
    vane.position.z = -.007;
    vane.castShadow = true;
    this.feather.add(vane);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -.035, .012),
      new THREE.Vector3(.005, .18, .012),
      new THREE.Vector3(.035, .38, .012),
      new THREE.Vector3(.09, .55, .012),
    ]);
    const shaft = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .008, 5, false), this.material(0xc9ae7b));
    shaft.castShadow = true;
    this.feather.add(shaft);
    this.featherSurfaces = [vane, shaft].map((mesh) => ({
      geometry: mesh.geometry,
      rest: mesh.geometry.attributes.position.array.slice(),
    }));
    this.featherSpring = {
      bend: new THREE.Vector2(), velocity: new THREE.Vector2(), applied: new THREE.Vector2(),
      previousTip: new THREE.Vector3(), previousVelocity: new THREE.Vector3(),
      tip: new THREE.Vector3(), motion: new THREE.Vector3(), acceleration: new THREE.Vector3(),
      rotation: new THREE.Quaternion(), time: null,
    };
  }

  subdivideFeather(geometry) {
    // Дополнительные вершины позволяют гнуться всему опахалу, а не только его краям.
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const points = source.attributes.position;
    const vertices = [];
    const split = (a, b, c, depth = 0) => {
      const edges = [a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)];
      const longest = Math.max(...edges);
      if (longest > .075 ** 2 && depth < 6) {
        if (longest === edges[1]) [a, b, c] = [b, c, a];
        else if (longest === edges[2]) [a, b, c] = [c, a, b];
        const middle = a.clone().add(b).multiplyScalar(.5);
        split(a, middle, c, depth + 1);
        split(middle, b, c, depth + 1);
      } else vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    };
    for (let index = 0; index < points.count; index += 3) {
      split(...[0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(points, index + offset)));
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    result.computeVertexNormals();
    return result;
  }

}
