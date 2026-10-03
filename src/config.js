export const sceneConfig = {
  // Начальный вертикальный угол камеры в градусах.
  // initialVerticalAngle: 38,
  initialVerticalAngle: 53,
  // Равномерный масштаб предметов декора.
  decorationScale: 1.5,
  // Эти модели доступны для просмотра, но запрещены в игровом периметре.
  forbiddenPerimeterModels: ['ottoman', 'bench', 'reading-table', 'floor-planter'],
  // Радиус столешницы узкого геридона.
  gueridonRadius: 0.24,
  // Размеры ламп сохраняются на поле, без растягивания до ширины клетки.
  readingLampTableRadius: 0.29,
  floorLampBaseRadius: 0.21,
  // Два пустых стула; один или оба повёрнуты относительно стола на 45°.
  cafeTableChairCount: 2,
  cafeTableChairAngle: 45,
  // Вероятность одного предмета из общего набора на отдельном стуле.
  chairDecorationChance: 0.5,
  // Смещение книг низкой полки внутрь в долях толщины корешка.
  lowShelfBookInset: 0.25,
};
