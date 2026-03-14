# Исправление v2: таймер «Occupied for» — использование реального времени Iberdrola

> Дата: 2026-03-14

## Введение (простыми словами)

### Что не так?

Таймер «Occupied for 1h 13min» показывает время с отставанием ~5 минут от реальности. Это потому что наша система записывает **своё время** (когда скрапер обнаружил изменение), а не **время Iberdrola** (когда машина реально подключилась).

### Пример из production

| Поле | Port 2 |
|------|--------|
| `update_date` (Iberdrola — реальное время) | **06:50:08** |
| `status_changed_at` (наш триггер) | **06:54:19** |
| Разница | **+4 мин** (= интервал скрапера) |

Таймер считает от `06:54` вместо `06:50`. На экране: «1h 13min» вместо «1h 17min».

### Почему предыдущая миграция не помогла?

Миграция от 2026-03-13 добавила обнаружение смены машины (OCCUPIED → OCCUPIED с изменённым `update_date`). В этом случае триггер **правильно** использует `COALESCE(update_date, NOW())`.

Но при **обычной** смене статуса (FREE → OCCUPIED) триггер по-прежнему использует `NOW()` — время скрапера. Именно этот случай происходит чаще всего.

---

## Корневая причина

Файл: `supabase/migrations/20260313000000_status_changed_at_detect_car_swap.sql`

```sql
-- При смене статуса:
IF OLD.port1_status IS DISTINCT FROM NEW.port1_status THEN
  NEW.port1_status_changed_at := NOW();  -- ← БАГ: время скрапера
END IF;

-- При смене машины (OK):
ELSIF NEW.port1_status = 'OCCUPIED'
  AND OLD.port1_update_date IS DISTINCT FROM NEW.port1_update_date THEN
  NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());  -- ← OK
```

---

## Исправление

### Fix 1: SQL-миграция (основной фикс)

Файл: `supabase/migrations/20260314000000_fix_status_changed_at_use_update_date.sql`

Изменение: `NOW()` → `COALESCE(NEW.port_update_date, NOW())` для **всех** случаев (INSERT, смена статуса, смена машины).

```sql
-- Было:
NEW.port1_status_changed_at := NOW();

-- Стало:
NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
```

### Fix 2: Realtime subscription (бонус)

Файл: `api/charger.ts:87`

```typescript
// Было:
event: 'INSERT',

// Стало:
event: '*',
```

**Проблема:** Скрапер делает UPSERT (`INSERT ... ON CONFLICT DO UPDATE`). После первого раза все обновления = UPDATE. Но подписка слушала только INSERT → фронтенд **никогда** не получал обновления через Realtime. Полагался на polling каждые 5 минут.

---

## Что изменится в поведении

| Ситуация | Было | Стало |
|----------|------|-------|
| FREE → OCCUPIED | `status_changed_at = NOW()` (время скрапера, +5 мин) | `status_changed_at = update_date` (время Iberdrola, точно) |
| OCCUPIED → FREE | `status_changed_at = NOW()` (+5 мин) | `status_changed_at = update_date` (точно) |
| Смена машины (OCCUPIED → OCCUPIED) | `status_changed_at = update_date` (уже OK) | Без изменений |
| Realtime обновления | Не работает (слушает INSERT, а приходят UPDATE) | Работает (слушает все события) |

---

## Проверка

1. Применить миграцию через Supabase Dashboard → SQL Editor
2. Дождаться следующего запуска скрапера (~5 мин)
3. Проверить в DevTools Console (перехват fetch):
   - `port2_status_changed_at` должен быть **равен** `port2_update_date` (разница < 1 сек)
4. На сайте: таймер должен показывать точное время от Iberdrola
5. В консоли: должны появиться `[Realtime:snapshots]` логи при обновлении данных

## Крайние случаи

- **`port_update_date` = NULL**: Обработано через `COALESCE(..., NOW())` — fallback на время скрапера
- **Heartbeat Iberdrola**: Если `updateDate` обновляется без реальной смены сессии — таймер сбросится. Это допустимо (показывает недавнее время вместо устаревшего)
- **Realtime `*` event**: Получает INSERT, UPDATE и DELETE. DELETE не влияет — фронтенд обрабатывает только `payload.new`
