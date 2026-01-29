# Azure Functions Proxy для Iberdrola API

Этот прокси позволяет обходить блокировку Iberdrola API через использование Azure IP-адресов, которые не заблокированы Akamai CDN.

## Почему Azure Functions?

- **Бесплатный tier**: 1 миллион запросов в месяц
- **IP-адреса не заблокированы**: Azure использует другие IP-диапазоны, которые не входят в блок-листы Akamai
- **Простота деплоя**: минимальная настройка
- **Serverless**: не нужно управлять серверами

## Структура проекта

```
azure/
├── host.json                    # Конфигурация Function App
├── package.json                 # Зависимости Node.js
├── iberdrola-proxy/
│   ├── function.json           # Метаданные HTTP trigger
│   └── index.js                # Логика прокси
└── README.md                   # Эта инструкция
```

## Быстрый старт

### Вариант 1: Деплой через Azure Portal (самый простой)

1. **Создай аккаунт Azure** (если еще нет):
   - Перейди на [portal.azure.com](https://portal.azure.com)
   - Зарегистрируйся (нужна карта для free tier)
   - Получи $200 кредитов на 30 дней + 12 месяцев бесплатных сервисов

2. **Создай Function App**:
   - В портале: **Create a resource** → **Function App**
   - Заполни параметры:
     - **Subscription**: выбери свою подписку
     - **Resource Group**: создай новую `iberdrola-proxy-rg`
     - **Function App name**: `iberdrola-proxy-[твое-имя]` (должно быть уникальным)
     - **Runtime stack**: Node.js
     - **Version**: 20 LTS
     - **Region**: **West Europe** или **Spain Central** (ближе к Iberdrola)
     - **Operating System**: Linux
     - **Plan type**: Consumption (Serverless)
   - Нажми **Review + create** → **Create**

3. **Задеплой код**:

   **Способ A: Через VS Code (рекомендуется)**
   ```bash
   # Установи расширение Azure Functions для VS Code
   # https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions

   # В VS Code:
   # 1. Открой Azure панель (иконка Azure слева)
   # 2. В разделе Functions найди свой Function App
   # 3. ПКМ на Function App → Deploy to Function App
   # 4. Выбери папку azure/
   ```

   **Способ B: Через ZIP-деплой**
   ```bash
   # Создай ZIP-архив
   cd azure
   zip -r deploy.zip . -x "*.git*" -x "node_modules/*"

   # Загрузи через портал:
   # Function App → Deployment Center → Manual Deployment (Push) → ZIP Deploy
   # Перетащи файл deploy.zip
   ```

4. **Получи URL функции**:
   ```
   https://iberdrola-proxy-[твое-имя].azurewebsites.net/api/iberdrola-proxy
   ```

5. **Настрой CORS** (если нужен доступ с фронтенда):
   - В портале: Function App → CORS
   - Добавь домен своего приложения (например `https://iberdrola-ev.vercel.app`)
   - Или `*` для разработки (не рекомендуется для продакшена)

6. **Добавь URL в .env**:
   ```bash
   # В корне проекта
   echo "VITE_AZURE_PROXY_ENDPOINT=https://iberdrola-proxy-[твое-имя].azurewebsites.net/api/iberdrola-proxy" >> .env
   ```

7. **Пересобери фронтенд**:
   ```bash
   yarn dev  # или yarn build для продакшена
   ```

### Вариант 2: Деплой через Azure CLI (для продвинутых)

1. **Установи Azure Functions Core Tools**:
   ```bash
   # macOS
   brew tap azure/functions
   brew install azure-functions-core-tools@4

   # Windows
   npm install -g azure-functions-core-tools@4 --unsafe-perm true

   # Linux
   wget -q https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb
   sudo dpkg -i packages-microsoft-prod.deb
   sudo apt-get update
   sudo apt-get install azure-functions-core-tools-4
   ```

2. **Залогинься в Azure**:
   ```bash
   az login
   ```

3. **Создай Function App** (через CLI):
   ```bash
   # Переменные
   RESOURCE_GROUP="iberdrola-proxy-rg"
   LOCATION="westeurope"
   STORAGE_ACCOUNT="iberdrolaproxystorage"
   FUNCTION_APP_NAME="iberdrola-proxy-YOUR-NAME"

   # Создай resource group
   az group create --name $RESOURCE_GROUP --location $LOCATION

   # Создай storage account (нужен для Azure Functions)
   az storage account create \
     --name $STORAGE_ACCOUNT \
     --location $LOCATION \
     --resource-group $RESOURCE_GROUP \
     --sku Standard_LRS

   # Создай Function App
   az functionapp create \
     --resource-group $RESOURCE_GROUP \
     --consumption-plan-location $LOCATION \
     --runtime node \
     --runtime-version 20 \
     --functions-version 4 \
     --name $FUNCTION_APP_NAME \
     --storage-account $STORAGE_ACCOUNT \
     --os-type Linux
   ```

4. **Задеплой функцию**:
   ```bash
   cd azure
   func azure functionapp publish $FUNCTION_APP_NAME
   ```

5. **Получи URL**:
   ```bash
   echo "https://${FUNCTION_APP_NAME}.azurewebsites.net/api/iberdrola-proxy"
   ```

## Тестирование прокси

После деплоя проверь, что прокси работает:

```bash
# Тест endpoint "list"
curl -X POST https://YOUR-APP.azurewebsites.net/api/iberdrola-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "list",
    "payload": {
      "dto": {
        "chargePointTypesCodes": ["P", "R", "I", "N"],
        "socketStatus": [],
        "advantageous": false,
        "connectorsType": ["2", "7"],
        "loadSpeed": [],
        "latitudeMax": 39.0,
        "latitudeMin": 38.0,
        "longitudeMax": 0.0,
        "longitudeMin": -1.0
      },
      "language": "en"
    }
  }'
```

Ожидаемый ответ: JSON с массивом `entidad` (станции зарядки).

## Мониторинг

### Логи в реальном времени

```bash
# Через CLI
func azure functionapp logstream $FUNCTION_APP_NAME

# Через портал
Function App → Log stream
```

### Метрики

В портале: Function App → Monitoring → Metrics

Отслеживай:
- **Function Execution Count** - количество запросов
- **Function Execution Units** - использование ресурсов
- **Http Server Errors** - ошибки 5xx

## Стоимость

**Free Tier включает**:
- 1 миллион запросов в месяц
- 400,000 GB-секунд вычислений

**Оценка использования**:
- 1 пользователь делает ~10 поисков в день
- Каждый поиск = ~50 запросов к прокси
- 1 пользователь = 500 запросов/день = 15,000 запросов/месяц
- **Бесплатно для ~60 активных пользователей**

**Если превысишь лимиты**:
- Дополнительные запросы: $0.20 за 1 миллион
- Например, 2 млн запросов/месяц = $0.20 (почти бесплатно)

## Решение проблем

### Ошибка: "Host not found"
- Подожди 2-3 минуты после деплоя (холодный старт)
- Проверь, что Function App запущен: `az functionapp show --name $FUNCTION_APP_NAME --resource-group $RESOURCE_GROUP`

### Ошибка: 403 Forbidden от Iberdrola
- Проверь регион Function App (должен быть West Europe или Spain Central)
- Azure IP может быть заблокирован - попробуй пересоздать Function App в другом регионе

### CORS ошибки
- Настрой CORS в портале: Function App → CORS → добавь свой домен
- Или используй `Access-Control-Allow-Origin: *` для разработки

### Функция не отвечает
- Проверь логи: `func azure functionapp logstream $FUNCTION_APP_NAME`
- Увеличь timeout: Function App → Configuration → General settings → Platform timeout (60s → 300s)

## Безопасность

### Для продакшена

1. **Включи authentication**:
   ```bash
   az functionapp auth update \
     --name $FUNCTION_APP_NAME \
     --resource-group $RESOURCE_GROUP \
     --enabled true
   ```

2. **Ограничь CORS**:
   - Удали `*`
   - Добавь только свой домен

3. **Добавь rate limiting** (Application Insights):
   ```bash
   az monitor app-insights component create \
     --app $FUNCTION_APP_NAME \
     --location $LOCATION \
     --resource-group $RESOURCE_GROUP
   ```

4. **Используй API keys** (опционально):
   - Измени `authLevel` в `function.json` на `"function"`
   - Получи ключ: Function App → Keys
   - Передавай в заголовке: `x-functions-key: YOUR_KEY`

## Альтернативы

Если Azure Functions не подходит:

1. **Cloudflare Workers** - аналог, но блокируется Iberdrola
2. **Vercel Edge Functions** - блокируется Iberdrola
3. **VPS (Hetzner/OVH)** - €3.50-4.50/месяц, больше контроля
4. **Oracle Cloud Free Tier** - бесплатный VPS, но медленный

## Поддержка

Если возникли проблемы:
1. Проверь [Azure Functions документацию](https://learn.microsoft.com/azure/azure-functions/)
2. Открой issue в репозитории
3. Проверь статус Azure: [status.azure.com](https://status.azure.com)

---

**Создано для проекта**: [iberdrola-ev](https://github.com/Kotkoa/iberdrola-ev)
