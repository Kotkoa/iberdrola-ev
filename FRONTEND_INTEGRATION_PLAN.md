# План интеграции Backend API во Frontend

## Цель
Интегрировать новые Edge Functions (`poll-station`, `start-watch`) в React фронтенд для:
- On-demand обновления статуса станции
- Подписки на уведомления с real-time polling
- Улучшения UX при rate limiting

---

## Новые API Endpoints

| Endpoint | Назначение | Request | Response |
|----------|-----------|---------|----------|
| `POST /poll-station` | Polling одной станции | `{ cupr_id }` | `{ ok, data: { cp_id, port1_status, port2_status, observed_at } }` |
| `POST /start-watch` | Подписка + polling | `{ cupr_id, port, subscription }` | `{ ok, data: { subscription_id, task_id, current_status, fresh, next_poll_in } }` |

---

## Точки интеграции

### 1. Station Page - poll-station
- [ ] [src/hooks/useStationData.ts](src/hooks/useStationData.ts) - основной хук
- [ ] [src/services/apiClient.ts](src/services/apiClient.ts) - добавить pollStation()
- [ ] [types/charger.ts](types/charger.ts) - расширить StationDataStatus

### 2. Подписка на порт - start-watch
- [ ] [src/pwa.ts](src/pwa.ts) - добавить subscribeWithWatch()
- [ ] [src/components/station/StationTab.tsx](src/components/station/StationTab.tsx) - обновить handleSubscribeClick

### 3. Поиск станций
- [x] Текущий flow достаточен - изменения не требуются

---

## Фаза 1: Типы TypeScript

### Задачи
- [ ] Создать файл `src/types/api.ts`
- [ ] Добавить `ApiSuccessResponse<T>` interface
- [ ] Добавить `ApiErrorResponse` interface
- [ ] Добавить `ApiResponse<T>` union type
- [ ] Добавить `ApiErrorCode` type
- [ ] Добавить `PollStationData` interface
- [ ] Добавить `StartWatchData` interface
- [ ] Добавить `StartWatchRequest` interface

### Расширение types/charger.ts
- [ ] Добавить `isRateLimited: boolean` в `StationDataStatus`
- [ ] Добавить `nextPollIn: number | null` в `StationDataStatus`

### Проверки
- [ ] **Unit tests:** Тесты для type guards
- [ ] **Backward compatibility:** Существующие типы не изменены
- [ ] **Документация:** JSDoc к каждому типу
- [ ] **Browser test:** `yarn check-types` проходит

---

## Фаза 2: API Client

### Задачи
- [ ] Создать файл `src/services/apiClient.ts`
- [ ] Реализовать `pollStation(cuprId)` функцию
- [ ] Реализовать `startWatch(request)` функцию
- [ ] Реализовать `isApiSuccess<T>()` type guard
- [ ] Реализовать `isRateLimited()` type guard

### Проверки
- [ ] **Unit tests:** Создать `src/services/__tests__/apiClient.test.ts`
  - [ ] `pollStation` returns success response
  - [ ] `pollStation` handles rate limit response
  - [ ] `pollStation` handles network error
  - [ ] `startWatch` creates subscription
  - [ ] Type guards работают корректно
- [ ] **Backward compatibility:** Не затрагивает `stationApi.ts`
- [ ] **Документация:** Обновить [docs/API.md](docs/API.md)
- [ ] **Browser test:** Network tab → POST /poll-station возвращает 200

---

## Фаза 3: useStationData интеграция

### Задачи
- [ ] Импортировать `pollStation`, `isApiSuccess`, `isRateLimited` из apiClient
- [ ] Добавить state `isRateLimited`
- [ ] Добавить state `nextPollIn`
- [ ] Заменить `fetchStationViaEdge` на `pollStation` в loading_api блоке
- [ ] Обработать success response
- [ ] Обработать rate limit response (fallback к кэшу)
- [ ] Обработать error response
- [ ] Добавить `pollDataToChargerStatus()` helper
- [ ] Обновить return value хука

### Проверки
- [ ] **Unit tests:** Обновить `src/hooks/__tests__/useStationData.test.ts`
  - [ ] Fresh данные из кэша (существующий) - НЕ СЛОМАН
  - [ ] Stale данные → вызов poll-station → success
  - [ ] Stale данные → poll-station rate limited → fallback к кэшу
  - [ ] `isRateLimited=true` при rate limit
  - [ ] `nextPollIn` заполняется из `retry_after`
- [ ] **Backward compatibility:**
  - [ ] Существующие тесты проходят
  - [ ] Realtime subscription работает
- [ ] **Документация:** Обновить [.claude/data-flow.md](.claude/data-flow.md)
- [ ] **Browser test:**
  - [ ] Station page → Network: POST /poll-station
  - [ ] Быстро обновить 3 раза → rate limit → данные из кэша

---

## Фаза 4: start-watch интеграция

### Задачи в src/pwa.ts
- [ ] Импортировать `startWatch`, `isApiSuccess` из apiClient
- [ ] Импортировать `StartWatchData` из types/api
- [ ] Создать `StartWatchResult` interface
- [ ] Реализовать `subscribeWithWatch()` функцию
- [ ] Добавить `arrayBufferToBase64()` helper

### Задачи в StationTab.tsx
- [ ] Импортировать `subscribeWithWatch`
- [ ] Обновить `handleSubscribeClick` использовать `subscribeWithWatch`

### Проверки
- [ ] **Unit tests:** Создать/обновить `src/pwa.test.ts`
  - [ ] `subscribeWithWatch` вызывает startWatch API
  - [ ] Ошибка при отсутствии push support
  - [ ] Ошибка при отклонении permission
- [ ] **E2E tests:** Создать `e2e/subscription.spec.ts`
  - [ ] Подписка на порт → success state
  - [ ] Network: POST /start-watch
- [ ] **Backward compatibility:**
  - [ ] `subscribeToStationNotifications` работает (legacy)
  - [ ] Существующие подписки сохранены
  - [ ] `restoreSubscriptionState` работает
- [ ] **Документация:** Обновить [docs/API.md](docs/API.md) Push Notifications
- [ ] **Browser test:**
  - [ ] "Get notified" → POST /start-watch
  - [ ] При `fresh=false` → Alert "Data updates in X min"
  - [ ] Кнопка в состоянии "Subscribed"

---

## Фаза 5: Performance оптимизации

### Задачи
- [ ] Создать `src/utils/rateLimitCache.ts`
- [ ] Реализовать `isStationRateLimited(cuprId)`
- [ ] Реализовать `markRateLimited(cuprId, retryAfterSec)`
- [ ] Реализовать `clearRateLimitCache()`
- [ ] Интегрировать в `useStationData.ts` - skip poll если rate limited
- [ ] Вызывать `markRateLimited` при получении rate limit response

### Проверки
- [ ] **Unit tests:** Создать `src/utils/__tests__/rateLimitCache.test.ts`
  - [ ] `isStationRateLimited` возвращает false для нового cuprId
  - [ ] `markRateLimited` + `isStationRateLimited` → true
  - [ ] После истечения времени → false
  - [ ] `clearRateLimitCache` очищает кэш
- [ ] **Backward compatibility:** Не влияет на существующую логику
- [ ] **Документация:** Комментарии в коде
- [ ] **Browser test:** 5 быстрых обновлений → 1-2 API вызова

---

## Финальная верификация

### TypeScript & Lint
- [ ] `yarn check-types` - без ошибок
- [ ] `yarn lint` - без ошибок

### Unit Tests
- [ ] `yarn test:run` - все тесты проходят
- [ ] Новые тесты покрывают все добавленные функции

### Browser Testing
- [ ] Station page загружается
- [ ] poll-station вызывается при stale данных
- [ ] Rate limit обрабатывается gracefully
- [ ] Подписка через start-watch работает
- [ ] fresh=false показывает индикатор
- [ ] Поиск станций работает (регрессия)
- [ ] Realtime обновления работают (регрессия)

### E2E Tests
- [ ] `yarn test:e2e` - все тесты проходят

### Документация
- [ ] [docs/API.md](docs/API.md) обновлен
- [ ] [.claude/data-flow.md](.claude/data-flow.md) обновлен

---

## Критические файлы

| Файл | Статус | Tests |
|------|--------|-------|
| `src/types/api.ts` | [ ] NEW | [ ] type guards |
| `src/services/apiClient.ts` | [ ] NEW | [ ] apiClient.test.ts |
| `src/utils/rateLimitCache.ts` | [ ] NEW | [ ] rateLimitCache.test.ts |
| `src/hooks/useStationData.ts` | [ ] MODIFY | [ ] update existing |
| `types/charger.ts` | [ ] MODIFY | - |
| `src/pwa.ts` | [ ] MODIFY | [ ] pwa.test.ts |
| `src/components/station/StationTab.tsx` | [ ] MODIFY | [ ] E2E |
| `docs/API.md` | [ ] UPDATE | - |
| `.claude/data-flow.md` | [ ] UPDATE | - |

---

## Прогресс

| Фаза | Статус | Дата начала | Дата окончания |
|------|--------|-------------|----------------|
| Фаза 1: Типы | [ ] | | |
| Фаза 2: API Client | [ ] | | |
| Фаза 3: useStationData | [ ] | | |
| Фаза 4: start-watch | [ ] | | |
| Фаза 5: Performance | [ ] | | |
| Финальная верификация | [ ] | | |
