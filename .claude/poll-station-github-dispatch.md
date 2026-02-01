# Plan: poll-station → GitHub Actions Dispatch

## Проблема

`poll-station` Edge Function напрямую вызывает Iberdrola API, но получает 403 (Akamai WAF блокирует Supabase IP).

## Решение

Изменить архитектуру согласно docs/API.md Section 12:

```
Текущий (BROKEN):
  poll-station → Iberdrola API → 403 BLOCKED

Новый:
  poll-station → GitHub Actions dispatch → scraper.yml → Iberdrola API → Supabase
                       ↓
              Вернуть кэш сразу (fresh=false)
                       ↓
              Realtime subscription доставит обновление
```

---

## Новая архитектура poll-station

```typescript
// poll-station/index.ts - НОВАЯ ЛОГИКА

Deno.serve(async (req) => {
  const { cupr_id } = await req.json();

  // 1. Получить текущий snapshot из кэша
  const snapshot = await getLatestSnapshot(cupr_id);

  // 2. Проверить rate limit (5 мин)
  const canTrigger = await canTriggerScraper(cupr_id);

  if (canTrigger) {
    // 3. Триггернуть GitHub Action (fire-and-forget)
    await triggerGitHubAction(cupr_id);

    // 4. Обновить throttle
    await updateThrottle(cupr_id);
  }

  // 5. Вернуть текущий кэш
  return Response.json({
    ok: true,
    data: {
      cp_id: snapshot.cp_id,
      port1_status: snapshot.port1_status,
      port2_status: snapshot.port2_status,
      overall_status: snapshot.overall_status,
      observed_at: snapshot.created_at,
    },
    meta: {
      fresh: false,  // Данные из кэша
      scraper_triggered: canTrigger,
      // Если canTrigger=true, данные обновятся через ~30-60 сек
    }
  });
});
```

---

## Компоненты

### 1. GitHub PAT Secret

Нужен Personal Access Token с scope `workflow` для триггера GitHub Actions.

```bash
# Добавить в Supabase Secrets
GITHUB_PAT=ghp_xxxxxxxxxxxxx
GITHUB_OWNER=kotkoa
GITHUB_REPO=iberdrola-scraper
```

### 2. Функция triggerGitHubAction

```typescript
async function triggerGitHubAction(cuprId: number): Promise<void> {
  const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
  const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER');
  const GITHUB_REPO = Deno.env.get('GITHUB_REPO');

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    console.warn('GitHub secrets not configured, skipping dispatch');
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/scraper.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${GITHUB_PAT}`,
          'User-Agent': 'Supabase-Edge-Function',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { cupr_id: String(cuprId) },
        }),
      }
    );

    if (!response.ok) {
      console.error(`GitHub dispatch failed: ${response.status}`);
    } else {
      console.log(`GitHub Action triggered for cupr_id=${cuprId}`);
    }
  } catch (error) {
    console.error('GitHub dispatch error:', error);
    // Fire-and-forget: не блокируем ответ
  }
}
```

### 3. Rate Limit Check (RPC)

Использовать существующую `can_poll_station` или создать новую:

```sql
-- Проверить можно ли триггерить скраппер (5 мин cooldown)
CREATE OR REPLACE FUNCTION can_trigger_scraper(p_cupr_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM snapshot_throttle
    WHERE cupr_id = (
      SELECT cp_id FROM station_metadata WHERE cupr_id = p_cupr_id LIMIT 1
    )
    AND last_snapshot_at > now() - INTERVAL '5 minutes'
  );
$$ LANGUAGE sql STABLE;
```

### 4. Обновить snapshot_throttle после триггера

```typescript
async function updateThrottle(cuprId: number): Promise<void> {
  const cpId = await getCpIdFromCuprId(cuprId);

  await supabase
    .from('snapshot_throttle')
    .upsert({
      cp_id: cpId,
      last_snapshot_at: new Date().toISOString(),
    }, { onConflict: 'cp_id' });
}
```

---

## Изменения в API Response

### Текущий response:
```typescript
{
  ok: true,
  data: {
    cp_id: number,
    port1_status: string,
    port2_status: string,
    overall_status: string,
    observed_at: string,  // Время данных
  }
}
```

### Новый response (с meta):
```typescript
{
  ok: true,
  data: {
    cp_id: number,
    port1_status: string,
    port2_status: string,
    overall_status: string,
    observed_at: string,
  },
  meta: {
    fresh: boolean,           // false = из кэша, true = только что получено (никогда true в новой архитектуре)
    scraper_triggered: boolean, // true = GitHub Action запущен
    expected_update: number | null,  // секунд до обновления (~30-60)
  }
}
```

---

## Frontend изменения

### Минимальные:

Frontend уже обрабатывает `fresh=false` корректно. Нужно только:

1. Показать индикатор "Обновляется..." если `scraper_triggered=true`
2. Полагаться на Realtime subscription для получения обновления

### Обновление useStationData:

```typescript
// После успешного poll-station
if (isApiSuccess(result)) {
  setData(pollDataToChargerStatus(result.data));
  setInternalState('ready');

  // Если скраппер запущен - показать индикатор
  if (result.meta?.scraper_triggered) {
    setRefreshPending(true);
    // Realtime subscription автоматически обновит данные
  }
}
```

---

## Sequence Diagram

```
Frontend                poll-station            GitHub Actions         Supabase
   │                         │                        │                    │
   │  POST /poll-station     │                        │                    │
   │ ───────────────────────>│                        │                    │
   │                         │                        │                    │
   │                         │  SELECT snapshot       │                    │
   │                         │ ──────────────────────────────────────────>│
   │                         │ <──────────────────────────────────────────│
   │                         │                        │                    │
   │                         │  workflow_dispatch     │                    │
   │                         │ ──────────────────────>│                    │
   │                         │                        │                    │
   │  { ok, data, meta }     │                        │                    │
   │ <───────────────────────│                        │                    │
   │                         │                        │                    │
   │  (показать кэш)         │                        │                    │
   │                         │                        │  scraper.yml       │
   │                         │                        │ ────────────────-->│
   │                         │                        │  (fetch Iberdrola) │
   │                         │                        │                    │
   │                         │                        │  INSERT snapshot   │
   │                         │                        │ ──────────────────>│
   │                         │                        │                    │
   │  Realtime: INSERT       │                        │                    │
   │ <───────────────────────────────────────────────────────────────────│
   │                         │                        │                    │
   │  (показать свежие данные)│                       │                    │
```

---

## Преимущества

| Аспект | Текущий | Новый |
|--------|---------|-------|
| Iberdrola API | Заблокирован (403) | Работает через GitHub Actions |
| Время ответа | 1-3 сек (с ошибкой) | <100ms (из кэша) |
| Свежесть данных | Никогда (403) | ~30-60 сек после триггера |
| UX | Ошибка | Кэш сразу + обновление через Realtime |

---

## Ограничения

1. **GitHub Actions rate limit**: 1000 API requests/hour (достаточно)
2. **Задержка**: ~30-60 сек между триггером и обновлением
3. **GitHub PAT**: Требует создание и хранение токена
4. **Fire-and-forget**: Нет гарантии что GitHub Action успешно запустился

---

## Checklist

- [x] Создать GitHub PAT с scope `workflow` (2026-02-01)
- [x] Добавить secrets в Supabase: `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO` (2026-02-01)
- [x] Обновить poll-station Edge Function (v3 deployed 2026-02-01)
- [x] Rate limit через `snapshot_throttle` table (встроено в функцию)
- [x] Тест: poll-station возвращает кэш (200 OK)
- [x] Тест: GitHub Action триггерится (#7739)
- [x] Тест: Realtime доставляет обновление (работает)
- [x] Обновить docs/API.md (добавить meta поля)
- [ ] Обновить BACKEND_REQUIREMENTS.md

## Результат (2026-02-01)

**poll-station v3** успешно задеплоен и работает:
- Response: `200 OK` с кэшем + `meta.scraper_triggered: true`
- GitHub Action: триггерится корректно
- Время ответа: ~1.5 сек (вместо 500 ошибки)
