# OrderFlow

Учебный e-commerce-проект с микросервисной архитектурой. Пользователь работает
с одной витриной, а создание заказа, оплата и передача событий выполняются
отдельными сервисами.

## Возможности

- регистрация, вход и авторизация по JWT;
- каталог товаров и React-витрина;
- создание заказа с проверкой цены и данных товара в `catalog-service`;
- обработка платежа и обновление статуса заказа через RabbitMQ;
- публикация событий успешной оплаты в Kafka и их сохранение аналитическим
  сервисом в MongoDB.

## Схема

```text
Browser
  │ HTTP :8080
  ▼
Nginx ──► Frontend (React)
  │ /api
  ▼
API Gateway ──► Auth service ──► PostgreSQL (auth)
  │             Catalog service ─► PostgreSQL (catalog)
  └──────────► Order service ──► PostgreSQL (orders)
                       │                 ▲
                       │ RabbitMQ         │ payment result
                       ▼                 │
                 Payment service ──► PostgreSQL (payments)
                       │
                       └── Kafka ──► Analytic service ──► MongoDB
```

## Сервисы

| Компонент | Назначение |
| --- | --- |
| `frontend` | Витрина на React, TypeScript и Vite. |
| `api-gateway` | Единая точка API: `/api/auth`, `/api/products`, `/api/orders`; проверяет JWT. |
| `auth-service` | Регистрация, вход, хеширование пароля Argon2 и выпуск JWT. |
| `catalog-service` | Хранение и выдача товаров. |
| `order-service` | Создание заказов, расчёт суммы и потребление результата оплаты. |
| `payment-service` | Создание/завершение платежа, публикация событий в RabbitMQ и Kafka. |
| `analytic-service` | Читает `payment-events` из Kafka и сохраняет события в MongoDB. |
| `notification-service` | Код потребителя платежных событий и API уведомлений; в текущий Compose-стек не включён. |

Каждый прикладной сервис создаёт свои таблицы при старте. Для основных данных
используются отдельные экземпляры PostgreSQL.

## Быстрый старт

Нужны Docker с Compose v2 и свободные порты `8080`, `5672`, `15672` и `9092`.
Для локального запуска создайте файл окружения:

```bash
cp infra/.env.core.example infra/.env.core
```

В `infra/.env.core` укажите безопасный `JWT_SECRET` и следующие значения Kafka
для запуска на той же машине:

```dotenv
NGINX_PORT=8080
JWT_SECRET=replace-with-a-long-random-secret
KAFKA_BIND_HOST=127.0.0.1
KAFKA_EXTERNAL_HOST=localhost
```

Запустите основной стек из корня репозитория:

```bash
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml up --build -d
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml ps
```

После старта витрина доступна по `http://localhost:8080`, а интерфейс управления
RabbitMQ — по `http://localhost:15672` (логин и пароль: `orderflow`).

Остановить стек, сохранив данные:

```bash
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml down
```

Для полного удаления созданных баз и очередей добавьте флаг `--volumes`.

## Каталог для первого запуска

В репозитории нет миграций или seed-данных, поэтому новый каталог пуст. Добавьте
товары через API `catalog-service` внутри Docker-сети. Например, следующая
команда создаёт один товар:

```bash
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml exec \
  catalog-service python -c "import json, urllib.request; data=json.dumps({'name':'Льняной блокнот','description':'Блокнот в твёрдой обложке','price':1200,'image':'','category':'Бумага'}).encode(); request=urllib.request.Request('http://localhost:8000/products', data=data, headers={'Content-Type':'application/json'}, method='POST'); print(urllib.request.urlopen(request).read().decode())"
```

Повторите запрос с нужными товарами и обновите страницу витрины. Цена передаётся
целым числом в рублях.

## Публичное API

Все перечисленные маршруты доступны через Nginx по адресу
`http://localhost:8080/api`.

| Метод | Маршрут | Авторизация | Назначение |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Нет | Создать пользователя и получить JWT. |
| `POST` | `/auth/login` | Нет | Войти и получить JWT. |
| `GET` | `/auth/me` | Bearer JWT | Получить текущего пользователя. |
| `GET` | `/products` | Нет | Получить каталог. |
| `GET` | `/products/{id}` | Нет | Получить товар. |
| `POST` | `/orders` | Bearer JWT | Создать заказ. |
| `GET` | `/orders/{id}` | Bearer JWT | Получить свой заказ. |

Пример регистрации:

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123"}'
```

Пример создания заказа — подставьте токен и идентификатор товара из
`GET /api/products`:

```bash
curl -X POST http://localhost:8080/api/orders \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":"<product_id>","quantity":2}]}'
```

## Аналитика

Аналитический сервис запускается отдельно: он подключается к Kafka по внешнему
адресу, поэтому укажите адрес хоста, на котором опубликован порт `9092`.

```bash
cp infra/.env.analytic.example infra/.env.analytic
```

Для локального запуска задайте в `infra/.env.analytic`:

```dotenv
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
MONGODB_PASSWORD=replace-with-a-strong-password
ANALYTIC_SERVICE_PORT=8005
```

Затем запустите сервис:

```bash
docker compose --env-file infra/.env.analytic -f infra/docker-compose.analytic.yml up --build -d
```

События доступны по `GET http://localhost:8005/events`; параметр `limit` задаёт
число последних записей (по умолчанию 20).

## Разработка

Frontend можно запускать отдельно:

```bash
cd frontend
npm ci
npm run dev
```

Vite проксирует `/api` на `http://localhost:8000` по умолчанию. Измените
`VITE_API_PROXY_TARGET`, если gateway опубликован на другом адресе. Для сборки
в production используются `npm run build` и Dockerfile фронтенда.

Для Python-кода в корне настроены Ruff и mypy (`pyproject.toml`). Зависимости
сервисов разделены по их `requirements.txt`.

## Известные ограничения текущей реализации

- `notification-service` не описан в `infra/docker-compose.core.yml`, а его
  PostgreSQL-база не создаётся Compose-конфигурацией.
- Gateway преднамеренно не публикует операции создания/редактирования товаров:
  каталог наполняется напрямую через `catalog-service`.

## Структура репозитория

```text
api-gateway/           Gateway и проверка JWT
auth-service/          Пользователи и токены
catalog-service/       Каталог товаров
order-service/         Заказы и потребитель payment.events
payment-service/       Платежи и издатель событий
analytic-service/      Потребитель Kafka и MongoDB
notification-service/  Уведомления (пока не подключены к стеку)
frontend/              React-витрина
infra/                 Nginx и Docker Compose-конфигурации
```
