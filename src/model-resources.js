// Материалы и текстуры могут принадлежать сразу нескольким деталям модели.
export function disposeModel(model) {
  const resources = new Set();
  const texture = (value) => {
    if (value?.isTexture) resources.add(value);
    else if (Array.isArray(value)) value.forEach(texture);
  };
  model.traverse((node) => {
    if (node.geometry) resources.add(node.geometry);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      resources.add(material);
      Object.values(material).forEach(texture);
      for (const uniform of Object.values(material.uniforms ?? {})) texture(uniform.value);
    }
  });
  resources.forEach((resource) => resource.dispose());
  model.removeFromParent();
}
