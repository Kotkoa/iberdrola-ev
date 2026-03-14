# Исправление: таймер «Occupied for» показывает неправильное время при смене машины

> Дата: 2026-03-13

## Введение (простыми словами)

### Что сейчас не так?

На сайте рядом с каждой розеткой показывается "Occupied for 5h 59min" — сколько времени розетка занята. Но эти 6 часов — **неправильно**. По данным Iberdrola, текущая зарядка началась ~2 часа назад. Значит кто-то уехал, и на его место встала другая машина. Но наш сайт этого не заметил и продолжает показывать время с момента **первой** машины.

### Почему это происходит?

В базе данных есть **триггер** (автоматическое правило) — он записывает время, когда розетка стала занятой. Но он срабатывает **только** когда статус меняется: `FREE → OCCUPIED` или `OCCUPIED → FREE`.

Проблема: когда одна машина уехала и сразу подъехала другая, наш скрапер проверяет станцию каждые 5 минут. Он пропускает короткий момент, когда розетка была свободна (может, 30 секунд). Скрапер видит: было OCCUPIED, стало OCCUPIED. Триггер думает «ничего не изменилось» и НЕ обновляет время.

Но Iberdrola **знает** о смене — у них поле `updateDate` обновилось на новое время (18:25 вместо 15:48). Мы записываем это новое значение в `port_update_date`, но триггер его **игнорирует**.

### Что будем делать?

Научим триггер замечать **смену машины**. Логика простая:

> «Если розетка была OCCUPIED и осталась OCCUPIED, **но** поле `port_update_date` изменилось — значит произошло событие (скорее всего новая машина). Обнови таймер.»

### Что именно меняем?

**Одна SQL-миграция** в frontend-репо (`iberdrola-ev`). Это обновит функцию триггера в базе данных. Больше ничего менять не нужно:
- Скрапер — без изменений (он уже записывает `port_update_date`)
- Фронтенд — без изменений (он уже читает `status_changed_at`)

---

## Детали

### Корневая причина

Файл: `iberdrola-ev/supabase/migrations/20260222000000_port_status_changed_at.sql`

Текущий триггер (строки 18-23) проверяет только смену статуса:

```sql
IF OLD.port1_status IS DISTINCT FROM NEW.port1_status THEN
  NEW.port1_status_changed_at := NOW();
END IF;
```

Нет проверки на изменение `port_update_date` → смена машины не детектируется.

### Исправление

Новая миграция: `iberdrola-ev/supabase/migrations/20260313000000_status_changed_at_detect_car_swap.sql`

```sql
CREATE OR REPLACE FUNCTION public.maintain_port_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.port1_status IS NOT NULL THEN
      NEW.port1_status_changed_at := NOW();
    END IF;
    IF NEW.port2_status IS NOT NULL THEN
      NEW.port2_status_changed_at := NOW();
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.port1_status IS DISTINCT FROM NEW.port1_status THEN
      NEW.port1_status_changed_at := NOW();
    ELSIF NEW.port1_status = 'OCCUPIED'
      AND OLD.port1_update_date IS DISTINCT FROM NEW.port1_update_date THEN
      NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
    END IF;

    IF OLD.port2_status IS DISTINCT FROM NEW.port2_status THEN
      NEW.port2_status_changed_at := NOW();
    ELSIF NEW.port2_status = 'OCCUPIED'
      AND OLD.port2_update_date IS DISTINCT FROM NEW.port2_update_date THEN
      NEW.port2_status_changed_at := COALESCE(NEW.port2_update_date, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

### Что изменится в поведении

| Ситуация | Сейчас | После исправления |
|----------|--------|-------------------|
| Розетка стала занятой (FREE → OCCUPIED) | Таймер стартует ✅ | Без изменений ✅ |
| Розетка освободилась (OCCUPIED → FREE) | Таймер стартует ✅ | Без изменений ✅ |
| Та же машина заряжается (OCCUPIED → OCCUPIED, `update_date` не менялся) | Таймер не сбрасывается ✅ | Без изменений ✅ |
| **Смена машины** (OCCUPIED → OCCUPIED, `update_date` изменился) | **Таймер НЕ сбрасывается ❌** | **Таймер сбрасывается на время из Iberdrola ✅** |

### Проверка

1. Применить миграцию через Supabase Dashboard → SQL Editor или `supabase db push`
2. Дождаться следующего запуска скрапера для станции 147988
3. Проверить через Chrome DevTools: `port1_status_changed_at` должен стать близким к `port1_update_date`
4. Фронтенд должен показать корректное время занятости

### Крайние случаи

- **Heartbeat без реальной смены машины**: Iberdrola иногда обновляет `updateDate` без смены сессии. Таймер сбросится — но это допустимо (покажет ~недавнее время вместо устаревшего на часы)
- **`port_update_date` = NULL**: Обработано через `COALESCE(..., NOW())`
- **Оба порта меняются одновременно**: Каждый порт обрабатывается независимо — OK
