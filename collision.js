/** Проверяет пересечение двух прямоугольников. */
export function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Разрешает столкновения по осям с учётом предыдущего и нового положения.
 * Это позволяет корректно приземляться сверху, упираться в боковые стенки
 * и ударяться головой о нижнюю сторону платформы.
 */
export function resolvePlatformCollisions(
  entity,
  platforms,
  previousX,
  previousY,
) {
  const targetX = entity.x;
  const targetY = entity.y;
  const dx = targetX - previousX;
  const dy = targetY - previousY;

  entity.grounded = false;

  // Сначала горизонтальная ось: столкновения с боковыми сторонами.
  entity.x = previousX;
  entity.y = previousY;
  entity.x += dx;

  for (const platform of platforms) {
    // Кнопочные плиты работают как платформы, а не как боковые стены.
    // Когда ноги находятся на уровне верхней кромки или выше неё, не выталкиваем
    // персонажа в сторону из-за микроскопического пересечения на кадре гравитации.
    // Вертикальная фаза ниже по-прежнему отвечает за приземление на плиту.
    if (platform.type === 'button-platform' && previousY + entity.height <= platform.y + 7) {
      continue;
    }
    if (!intersects(entity, platform)) continue;

    const previousRight = previousX + entity.width;
    const previousLeft = previousX;

    if (dx > 0 && previousRight <= platform.x + 1) {
      entity.x = platform.x - entity.width;
      entity.vx = 0;
    } else if (dx < 0 && previousLeft >= platform.x + platform.width - 1) {
      entity.x = platform.x + platform.width;
      entity.vx = 0;
    } else {
      // Если уже находились рядом с платформой, выбираем ближайшую грань.
      const pushLeft = entity.x + entity.width - platform.x;
      const pushRight = platform.x + platform.width - entity.x;
      if (pushLeft <= pushRight) {
        entity.x = platform.x - entity.width;
      } else {
        entity.x = platform.x + platform.width;
      }
      entity.vx = 0;
    }
  }

  // Затем вертикальная ось, используя уже скорректированное X.
  entity.y = previousY + dy;

  for (const platform of platforms) {
    if (!intersects(entity, platform)) continue;
    // Потолки/перемычки пропускают тело сверху вниз, но останавливают прыжок снизу.
    if (platform.ceilingOnly && dy >= 0) continue;

    const previousBottom = previousY + entity.height;
    const previousTop = previousY;
    const platformBottom = platform.y + platform.height;

    // Падение сверху: нижняя грань пересекла верх платформы.
    if (dy >= 0 && previousBottom <= platform.y + 1) {
      entity.y = platform.y - entity.height;
      entity.vy = 0;
      entity.grounded = true;
    // Прыжок снизу: верхняя грань пересекла нижнюю грань платформы.
    } else if (dy < 0 && previousTop >= platformBottom - 1) {
      entity.y = platformBottom;
      entity.vy = 0;
    } else {
      // Защита от небольшого пересечения при старте рядом с платформой.
      const overlapTop = entity.y + entity.height - platform.y;
      const overlapBottom = platformBottom - entity.y;
      if (dy >= 0 && overlapTop <= overlapBottom) {
        entity.y = platform.y - entity.height;
        entity.vy = 0;
        entity.grounded = true;
      } else if (dy < 0 && overlapBottom < overlapTop) {
        entity.y = platformBottom;
        entity.vy = 0;
      }
    }
  }
}
