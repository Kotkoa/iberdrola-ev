# E2E Tests падают с 14 марта 2026 — «poll-station should not have been called»

## Сводка

Начиная с коммита **23095330184** от `2026-03-14T20:03:12Z` («fix: update station data freshness TTL to 2 minutes and adjust relate…») и на каждом последующем push в `main` workflow **E2E Tests** падает с одним и тем же набором из 3 упавших тестов. Последний падающий прогон — `24624453437` от `2026-04-19T08:06:16Z`.

Все остальные 11 тестов E2E проходят. CI-инфраструктура исправна.

## Упавшие тесты

Файл: [e2e/tests/station-data-flow.spec.ts](../e2e/tests/station-data-flow.spec.ts)

1. `Station data flow › fresh cache — shows data without calling poll-station` (строка 16)
2. `Station data flow › fresh cache — both ports available` (строка 42)
3. `Station data flow › fresh cache — both ports busy` (строка 62)

## Сообщение об ошибке

```
Error: poll-station should not have been called

expect(received).toHaveLength(expected)
Expected length: 0
Received length: 1
Received array:  [{"body": {"cupr_id": 144569}, "method": "POST", ...
                   "url": "https://test.supabase.co/functions/v1/poll-station"}]

  at assertPollNotCalled (e2e/helpers/assert-requests.ts:12:61)
  at e2e/tests/station-data-flow.spec.ts:79:5
```

Все 3 теста падают на хелпере [e2e/helpers/assert-requests.ts:12](../e2e/helpers/assert-requests.ts#L12) — приложение вызывает edge-функцию `poll-station`, хотя по сценарию снапшот считается «свежим» и опрос не должен запускаться.

## Хронология

| Дата | Run ID | Коммит |
|------|--------|--------|
| 2026-03-14 20:03 | 23095330184 | `fix: update station data freshness TTL to 2 minutes…` ← первое падение |
| 2026-03-14 22:54 | 23098140279 | `fix: reduce can_poll_station cooldown from 5 minutes to 2 minutes…` |
| 2026-03-14 22:59 | 23098211769 | `fix: drop existing can_poll_station function before recreation…` |
| 2026-03-29 01:11 | 23698350943 | `feat: implement background poll RPC…` |
| 2026-03-29 01:32 | 23698674319 | `fix: remove snapshot_throttle table…` |
| 2026-03-29 14:23 | 23711162725 | `feat: integrate Google Analytics tracking…` |
| 2026-03-29 15:08 | 23712011438 | `fix: correct gtag function…` |
| 2026-04-02 12:18 | 23899993617 | `feat: enhance layout and styling for SearchTab…` |
| 2026-04-02 16:12 | 23910113856 | `feat: add verification state to stations…` |
| 2026-04-02 16:19 | 23910436354 | `feat: add can_poll_station function with reduced cooldown to 2 minutes…` |
| 2026-04-02 16:19 | 23910444393 | `feat: drop existing search_stations_nearby function…` |
| 2026-04-19 08:06 | 24624453437 | `feat: implement subscription deactivation on polling task failure…` |

Предыдущий успешный прогон: `23085019381` от `2026-03-14 09:15`.

## Корневая причина

Фабрика «свежего» снапшота рассинхронизирована с продовым TTL.

### Что случилось

В коммите от 14 марта (23095330184) `STATION_TTL_MINUTES` уменьшили с **5 минут до 2 минут**:

[src/constants/index.ts:103-110](../src/constants/index.ts#L103-L110)
```ts
export const DATA_FRESHNESS = {
  /** TTL for station data freshness (minutes). Matches server-side throttle (2 min). */
  STATION_TTL_MINUTES: 2,
  ...
} as const;
```

При этом фабрика «свежего» снапшота в E2E-тестах продолжает ставить `observed_at` ровно на **2 минуты назад**:

[e2e/fixtures/station-data.ts:47-51](../e2e/fixtures/station-data.ts#L47-L51)
```ts
/** Snapshot within TTL (2 min ago, fresh for TTL=5) */
export function createFreshSnapshot(options: SnapshotOptions = {}) {
  const freshTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  return createSnapshot({ observedAt: freshTime, ...options });
}
```

Комментарий всё ещё утверждает «fresh for TTL=5», но TTL уже равен 2. Снапшот оказывается ровно на границе TTL: к моменту проверки `isDataStale(observed_at, 2)` в приложении проходит ещё несколько сотен миллисекунд (загрузка страницы, инициализация React), снапшот становится «старым», и хук [src/hooks/useStationData.ts](../src/hooks/useStationData.ts) дергает `poll-station`.

Вторая точка рассинхронизации — [e2e/fixtures/constants.ts:12](../e2e/fixtures/constants.ts#L12):

```ts
export const TEST_TTL_MINUTES = 5;
```

Тестовая константа TTL тоже осталась 5 и не соответствует продовой.

### Почему падение стабильное

Рабочий процесс в тесте такой:
1. Фикстура ставит `observed_at = now - 2:00.000`.
2. Playwright стартует страницу и перехватывает запросы.
3. Хук `useStationData` вызывает `isDataStale(observed_at, 2)`.
4. Реальное время проверки — `now + (100…500 мс на загрузку)`, т.е. возраст снапшота **> 2 минут**.
5. Хук считает данные stale → вызывает `poll-station` → `assertPollNotCalled` падает.

Это не flaky-падение — разница выполнения даёт устойчивый перекос в сторону stale. Retry тоже проваливается (см. логи: Retry #1 и Retry #2 падают одинаково).

## Как чинить

Минимальное изменение в одном месте — сократить «возраст» свежего снапшота и поправить комментарий:

[e2e/fixtures/station-data.ts:47-51](../e2e/fixtures/station-data.ts#L47-L51)
```ts
/** Snapshot within TTL (30 s ago, fresh for STATION_TTL_MINUTES=2) */
export function createFreshSnapshot(options: SnapshotOptions = {}) {
  const freshTime = new Date(Date.now() - 30 * 1000).toISOString();
  return createSnapshot({ observedAt: freshTime, ...options });
}
```

Дополнительно стоит:

- Синхронизировать [e2e/fixtures/constants.ts:12](../e2e/fixtures/constants.ts#L12) с продом: `TEST_TTL_MINUTES = 2` — или импортировать `DATA_FRESHNESS.STATION_TTL_MINUTES` напрямую, чтобы таких расхождений больше не возникало.
- Обновить `createStaleSnapshot`, если его `20 * 60 * 1000` опирается на прежний TTL (20 минут > 2 минут — здесь всё ещё корректно, но пересмотреть стоит).

## Связанные файлы

| Файл | Роль |
|------|------|
| [e2e/tests/station-data-flow.spec.ts](../e2e/tests/station-data-flow.spec.ts) | Сценарии тестов fresh cache |
| [e2e/fixtures/station-data.ts](../e2e/fixtures/station-data.ts) | **Фабрика свежего/старого снапшота (источник бага)** |
| [e2e/fixtures/constants.ts](../e2e/fixtures/constants.ts) | `TEST_TTL_MINUTES` устарел |
| [e2e/helpers/assert-requests.ts](../e2e/helpers/assert-requests.ts) | `assertPollNotCalled` — место падения |
| [src/constants/index.ts](../src/constants/index.ts) | `STATION_TTL_MINUTES = 2` (продовое значение) |
| [src/hooks/useStationData.ts](../src/hooks/useStationData.ts) | Вызывает `poll-station` при stale-данных |

## Ссылки на прогоны

- Последний: https://github.com/Kotkoa/iberdrola-ev/actions/runs/24624453437
- Первый с ошибкой: https://github.com/Kotkoa/iberdrola-ev/actions/runs/23095330184
