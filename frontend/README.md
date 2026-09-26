# OrderFlow Frontend

Минималистичный магазин на React + TypeScript + Vite для учебного проекта OrderFlow.

Интерфейс выглядит как обычная витрина: каталог, корзина, оформление заказа, статус и история обработки. Технические детали микросервисов не показываются покупателю напрямую.

## Команды

```bash
npm install
npm run dev
npm run build
npm run lint
```

## API

Все запросы идут через `/api`, чтобы frontend мог работать за Nginx:

- `POST /api/auth/register` - регистрация и получение JWT.
- `POST /api/auth/login` - вход и получение JWT.
- `GET /api/auth/me` - проверка сохранённой сессии.
- `GET /api/products` - загрузка товаров.
- `POST /api/orders` - создание заказа с Bearer-токеном.
- `GET /api/orders/{id}` - polling с Bearer-токеном каждые 1.5 секунды до статуса `paid` или `payment_failed`.

В production `/api` проксирует Nginx. При `npm run dev` Vite проксирует `/api` на
`http://localhost:8000`; адрес можно переопределить через `VITE_API_PROXY_TARGET`.
Если frontend и Gateway опубликованы на разных origin, полный публичный префикс API
можно передать через `VITE_API_BASE_URL` во время сборки.
