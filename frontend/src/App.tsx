import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import brassLabelsImage from './assets/products/brass-labels.jpg'
import linenNotebookImage from './assets/products/linen-notebook.jpg'
import marbleDeskSetImage from './assets/products/marble-desk-set.jpg'
import oliveCupImage from './assets/products/olive-cup.jpg'
import './App.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const ACCESS_TOKEN_STORAGE_KEY = 'orderflow.accessToken'

const orderStatuses = [
  'created',
  'payment_pending',
  'paid',
  'payment_failed',
] as const

type AuthMode = 'login' | 'register'
type AuthStatus = 'checking' | 'anonymous' | 'authenticated'
type OrderStatus = (typeof orderStatuses)[number]
type EventTone = 'neutral' | 'success' | 'danger'

type AuthUser = {
  id: string
  email: string
}

type AuthResponse = {
  access_token: string
  token_type: string
  user: AuthUser
}

type Product = {
  id: string
  name: string
  description: string
  price: number
  image: string
  category: string
}

type DraftLine = Product & {
  quantity: number
}

type OrderDetails = {
  id: string
  status: OrderStatus
  totalAmount: number
}

type EventEntry = {
  id: string
  title: string
  detail: string
  tone: EventTone
  time: string
}

type TimelineState = 'done' | 'active' | 'pending' | 'failed'

type TimelineStep = {
  key: string
  label: string
  description: string
  state: TimelineState
}

type LooseRecord = Record<string, unknown>

const productImages = [
  marbleDeskSetImage,
  linenNotebookImage,
  brassLabelsImage,
  oliveCupImage,
]

const productImagesById: Record<string, string> = {
  'marble-desk-set': marbleDeskSetImage,
  'linen-notebook': linenNotebookImage,
  'brass-labels': brassLabelsImage,
  'olive-cup': oliveCupImage,
}

const productCategories = ['Рабочий стол', 'Бумага', 'Аксессуары', 'Хранение']

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function readStoredAccessToken(): string | null {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeAccessToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Авторизация продолжит работать до перезагрузки, если storage недоступен.
  }
}

function readValue(record: LooseRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key]
    }
  }

  return undefined
}

function readString(
  record: LooseRecord,
  keys: string[],
  fallback: string,
): string {
  const value = readValue(record, keys)

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return fallback
}

function readNumber(
  record: LooseRecord,
  keys: string[],
  fallback: number,
): number {
  const value = readValue(record, keys)

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function normalizeStatus(value: unknown): OrderStatus {
  const normalized = String(value ?? 'created')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')

  if (orderStatuses.includes(normalized as OrderStatus)) {
    return normalized as OrderStatus
  }

  if (['pending', 'processing', 'payment_processing'].includes(normalized)) {
    return 'payment_pending'
  }

  if (['success', 'succeeded', 'payment_succeeded', 'complete'].includes(normalized)) {
    return 'paid'
  }

  if (['failed', 'declined', 'payment_declined'].includes(normalized)) {
    return 'payment_failed'
  }

  return 'created'
}

function normalizeProduct(value: unknown, index: number): Product {
  const record = isRecord(value) ? value : {}
  const id = readString(record, ['id', 'product_id', 'productId', 'sku'], `product-${index + 1}`)
  const cents = readNumber(record, ['price_cents', 'amount_cents'], Number.NaN)
  const price = Number.isFinite(cents)
    ? cents / 100
    : readNumber(record, ['price', 'amount', 'unit_price'], 0)

  return {
    id,
    name: readString(record, ['name', 'title'], `Товар ${index + 1}`),
    description: readString(record, ['description', 'details'], 'Описание скоро появится.'),
    price,
    image: readString(
      record,
      ['image', 'image_url', 'imageUrl', 'thumbnail', 'photo'],
      productImagesById[id] ?? productImages[index % productImages.length],
    ),
    category: readString(
      record,
      ['category', 'collection', 'type'],
      productCategories[index % productCategories.length],
    ),
  }
}

function extractProductList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!isRecord(payload)) {
    return []
  }

  const nested = readValue(payload, ['products', 'items', 'data', 'results'])

  return Array.isArray(nested) ? nested : []
}

function unwrapOrderPayload(payload: unknown): LooseRecord {
  if (!isRecord(payload)) {
    return {}
  }

  const nested = readValue(payload, ['order', 'data', 'result'])

  return isRecord(nested) ? nested : payload
}

function normalizeOrder(
  payload: unknown,
  fallbackTotal: number,
  fallbackStatus: OrderStatus,
): OrderDetails {
  const record = unwrapOrderPayload(payload)
  const id = readString(record, ['id', 'order_id', 'orderId'], '')

  if (!id) {
    throw new ApiError(502, 'API вернул заказ без идентификатора.')
  }

  return {
    id,
    status: normalizeStatus(readValue(record, ['status', 'state']) ?? fallbackStatus),
    totalAmount: readNumber(
      record,
      ['total_amount', 'totalAmount', 'total', 'amount'],
      fallbackTotal,
    ),
  }
}

function extractApiMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (Array.isArray(value)) {
    const messages = value
      .map(extractApiMessage)
      .filter((message): message is string => Boolean(message))

    return messages.length ? messages.join('; ') : null
  }

  if (!isRecord(value)) {
    return null
  }

  const message = readValue(value, ['msg', 'message'])

  if (typeof message === 'string' && message.trim()) {
    return message
  }

  return extractApiMessage(value.detail)
}

function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return 'Не удалось связаться с магазином. Проверьте подключение и попробуйте ещё раз.'
  }

  if (error.status === 401) {
    return 'Сессия истекла или данные для входа неверны.'
  }

  if (error.status === 404) {
    return 'Запрашиваемые данные не найдены.'
  }

  if (error.status === 422) {
    return `Проверьте введённые данные: ${error.message}`
  }

  return error.status >= 500 ? `${fallback} Сервис временно недоступен.` : error.message
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  const text = response.status === 204 ? '' : await response.text()

  if (!response.ok) {
    let payload: unknown = text

    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        // Для не-JSON ответа ниже будет использован исходный текст.
      }
    }

    throw new ApiError(
      response.status,
      extractApiMessage(payload) ?? response.statusText ?? 'Ошибка API',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (text ? JSON.parse(text) : undefined) as T
}

async function fetchProducts(): Promise<Product[]> {
  const payload = await apiRequest<unknown>('/products')
  return extractProductList(payload).map(normalizeProduct)
}

async function authenticate(
  mode: AuthMode,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(`/auth/${mode}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

async function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

async function createOrder(
  lines: DraftLine[],
  totalAmount: number,
  accessToken: string,
): Promise<OrderDetails> {
  const payload = {
    items: lines.map((line) => ({
      product_id: line.id,
      quantity: line.quantity,
    })),
  }

  const response = await apiRequest<unknown>('/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  })

  return normalizeOrder(response, totalAmount, 'created')
}

async function fetchOrder(
  orderId: string,
  totalAmount: number,
  accessToken: string,
): Promise<OrderDetails> {
  const response = await apiRequest<unknown>(`/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return normalizeOrder(response, totalAmount, 'created')
}

function formatMoney(value: number): string {
  return currencyFormatter.format(value)
}

function formatStatus(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    created: 'Заказ создан',
    payment_pending: 'Ожидает оплату',
    paid: 'Оплачен',
    payment_failed: 'Оплата не прошла',
  }

  return labels[status]
}

function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'paid' || status === 'payment_failed'
}

function getTimeline(status: OrderStatus): TimelineStep[] {
  return [
    {
      key: 'created',
      label: 'Заказ принят',
      description: 'Мы получили ваш заказ',
      state: 'done',
    },
    {
      key: 'payment',
      label: 'Оплата',
      description:
        status === 'payment_failed'
          ? 'Платёж отклонён'
          : status === 'paid'
            ? 'Платёж подтверждён'
            : 'Проверяем оплату',
      state:
        status === 'payment_failed'
          ? 'failed'
          : status === 'paid'
            ? 'done'
            : 'active',
    },
    {
      key: 'completed',
      label: 'Готово',
      description:
        status === 'paid'
          ? 'Заказ оплачен'
          : status === 'payment_failed'
            ? 'Заказ не оплачен'
            : 'Ожидаем подтверждение',
      state: status === 'paid' ? 'done' : status === 'payment_failed' ? 'failed' : 'pending',
    },
  ]
}

function getEventDefinitions(order: OrderDetails): Omit<EventEntry, 'id' | 'time'>[] {
  const events: Omit<EventEntry, 'id' | 'time'>[] = [
    {
      title: 'Заказ принят',
      detail: `Номер ${order.id}`,
      tone: 'neutral',
    },
  ]

  if (order.status !== 'created') {
    events.push({
      title: 'Статус заказа обновлён',
      detail: formatStatus(order.status),
      tone: 'neutral',
    })
  }

  if (order.status === 'paid') {
    events.push({
      title: 'Оплата прошла',
      detail: `${formatMoney(order.totalAmount)} оплачено`,
      tone: 'success',
    })
  }

  if (order.status === 'payment_failed') {
    events.push({
      title: 'Оплата не прошла',
      detail: 'Можно попробовать оформить заказ ещё раз',
      tone: 'danger',
    })
  }

  return events
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(() => readStoredAccessToken())
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [currentOrder, setCurrentOrder] = useState<OrderDetails | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<EventEntry[]>([])
  const seenEventsRef = useRef<Set<string>>(new Set())

  const draftLines = useMemo(
    () =>
      products
        .map((product) => ({
          ...product,
          quantity: selectedQuantities[product.id] ?? 0,
        }))
        .filter((product) => product.quantity > 0),
    [products, selectedQuantities],
  )

  const totalAmount = useMemo(
    () => draftLines.reduce((total, line) => total + line.price * line.quantity, 0),
    [draftLines],
  )

  const selectedCount = useMemo(
    () => draftLines.reduce((total, line) => total + line.quantity, 0),
    [draftLines],
  )

  const handleLogout = useCallback(() => {
    storeAccessToken(null)
    setAuthToken(null)
    setAuthUser(null)
    setAuthStatus('anonymous')
    setCurrentOrder(null)
    setOrderError(null)
    setEventLog([])
    seenEventsRef.current.clear()
  }, [])

  useEffect(() => {
    if (!authToken) {
      setAuthUser(null)
      setAuthStatus('anonymous')
      return
    }

    let cancelled = false
    setAuthStatus('checking')

    async function restoreSession() {
      try {
        const user = await fetchCurrentUser(authToken as string)

        if (!cancelled) {
          setAuthUser(user)
          setAuthStatus('authenticated')
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        setAuthUser(null)
        setAuthStatus('anonymous')

        if (error instanceof ApiError && error.status === 401) {
          storeAccessToken(null)
          setAuthToken(null)
        } else {
          setAuthError(getRequestErrorMessage(error, 'Не удалось проверить сохранённую сессию.'))
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [authToken])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)

    try {
      const catalog = await fetchProducts()
      setProducts(catalog)
    } catch (error) {
      setProducts([])
      setCatalogError(getRequestErrorMessage(error, 'Не удалось загрузить каталог.'))
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const handleAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (authSubmitting) {
        return
      }

      setAuthSubmitting(true)
      setAuthError(null)

      try {
        const response = await authenticate(authMode, authEmail.trim(), authPassword)
        storeAccessToken(response.access_token)
        setAuthToken(response.access_token)
        setAuthUser(response.user)
        setAuthStatus('authenticated')
        setAuthPassword('')
      } catch (error) {
        const fallback =
          authMode === 'login'
            ? 'Не удалось войти.'
            : 'Не удалось зарегистрироваться. Возможно, этот email уже используется.'
        setAuthError(getRequestErrorMessage(error, fallback))
      } finally {
        setAuthSubmitting(false)
      }
    },
    [authEmail, authMode, authPassword, authSubmitting],
  )

  const changeQuantity = useCallback((productId: string, delta: number) => {
    setSelectedQuantities((current) => {
      const nextQuantity = (current[productId] ?? 0) + delta
      const next = { ...current }

      if (nextQuantity <= 0) {
        delete next[productId]
      } else {
        next[productId] = nextQuantity
      }

      return next
    })
  }, [])

  const handleCreateOrder = useCallback(async () => {
    if (!draftLines.length || creatingOrder) {
      return
    }

    if (!authToken || authStatus !== 'authenticated') {
      setOrderError('Войдите или зарегистрируйтесь, чтобы оформить заказ.')
      return
    }

    setCreatingOrder(true)
    setOrderError(null)

    try {
      const order = await createOrder(draftLines, totalAmount, authToken)
      setCurrentOrder(order)
      setSelectedQuantities({})
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLogout()
      }

      setOrderError(getRequestErrorMessage(error, 'Не удалось создать заказ.'))
    } finally {
      setCreatingOrder(false)
    }
  }, [authStatus, authToken, creatingOrder, draftLines, handleLogout, totalAmount])

  useEffect(() => {
    if (!currentOrder) {
      return
    }

    const definitions = getEventDefinitions(currentOrder)
    const freshEvents = definitions.flatMap((event) => {
      const eventKey = `${currentOrder.id}:${event.title}`

      if (seenEventsRef.current.has(eventKey)) {
        return []
      }

      seenEventsRef.current.add(eventKey)

      return [
        {
          ...event,
          id: `${eventKey}:${Date.now()}`,
          time: timeFormatter.format(new Date()),
        },
      ]
    })

    if (!freshEvents.length) {
      return
    }

    setEventLog((current) => [...freshEvents, ...current].slice(0, 6))
  }, [currentOrder])

  const activeOrderId = currentOrder?.id
  const activeOrderStatus = currentOrder?.status
  const activeOrderTotal = currentOrder?.totalAmount ?? 0

  useEffect(() => {
    if (
      !activeOrderId ||
      !activeOrderStatus ||
      !authToken ||
      isTerminalStatus(activeOrderStatus)
    ) {
      return
    }

    const orderId = activeOrderId

    let cancelled = false

    async function pollOrder() {
      try {
        const order = await fetchOrder(orderId, activeOrderTotal, authToken as string)

        if (!cancelled) {
          setCurrentOrder(order)
          setOrderError(null)
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            handleLogout()
            setOrderError('Сессия истекла. Войдите снова, чтобы продолжить.')
          } else {
            setOrderError(getRequestErrorMessage(error, 'Не удалось обновить статус заказа.'))
          }
        }
      }
    }

    void pollOrder()

    const intervalId = window.setInterval(() => {
      void pollOrder()
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [activeOrderId, activeOrderStatus, activeOrderTotal, authToken, handleLogout])

  const timeline = currentOrder ? getTimeline(currentOrder.status) : []

  return (
    <main className="shop-shell">
      <header className="shop-header">
        <a className="brand" href="#catalog">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>OrderFlow</strong>
            <small>аксессуары для дома и офиса</small>
          </span>
        </a>

        <nav className="shop-nav" aria-label="Навигация">
          <a href="#catalog">Каталог</a>
          <a href="#cart">Корзина</a>
          <a href="#status">Заказ</a>
        </nav>

      </header>

      <section className="shop-intro">
        <div>
          <p className="eyebrow">Новая коллекция</p>
          <h1>Спокойные вещи для стола и документов</h1>
        </div>
        <p>
          Натуральные фактуры, спокойные оттенки и продуманные детали для рабочего
          пространства, в котором приятно проводить каждый день.
        </p>
      </section>

      <div className="shop-layout">
        <section className="catalog-section" id="catalog" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Каталог</p>
              <h2 id="catalog-title">Выберите товары</h2>
            </div>
            <button className="secondary-button" type="button" onClick={loadCatalog}>
              Обновить
            </button>
          </div>

          {catalogError ? <p className="form-message error">{catalogError}</p> : null}

          <div className="product-grid">
            {catalogLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <div className="product-card skeleton" key={index} />
                ))
              : products.map((product) => {
                  const quantity = selectedQuantities[product.id] ?? 0

                  return (
                    <article className="product-card" key={product.id}>
                      <div className="product-media">
                        <img src={product.image} alt={product.name} />
                        <span>{product.category}</span>
                      </div>

                      <div className="product-content">
                        <div className="product-title-row">
                          <h3>{product.name}</h3>
                          {quantity > 0 ? <span className="quantity-badge">{quantity}</span> : null}
                        </div>
                        <p>{product.description}</p>
                      </div>

                      <div className="product-actions">
                        <strong>{formatMoney(product.price)}</strong>
                        <button type="button" onClick={() => changeQuantity(product.id, 1)}>
                          В корзину
                        </button>
                      </div>
                    </article>
                  )
                })}
          </div>

          {!catalogLoading && !products.length ? (
            <p className="empty-state">В каталоге пока нет товаров.</p>
          ) : null}
        </section>

        <aside className="checkout-column">
          <section className="auth-card" id="account" aria-labelledby="account-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Аккаунт</p>
                <h2 id="account-title">
                  {authStatus === 'authenticated' ? 'Вы вошли' : 'Вход для заказа'}
                </h2>
              </div>
            </div>

            {authStatus === 'checking' ? (
              <p className="empty-state" aria-live="polite">
                Проверяем сессию...
              </p>
            ) : authStatus === 'authenticated' && authUser ? (
              <div className="account-summary">
                <div>
                  <span>Покупатель</span>
                  <strong>{authUser.email}</strong>
                </div>
                <button className="secondary-button" type="button" onClick={handleLogout}>
                  Выйти
                </button>
              </div>
            ) : (
              <>
                <div className="auth-tabs" role="tablist" aria-label="Способ авторизации">
                  <button
                    className={authMode === 'login' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'login'}
                    onClick={() => {
                      setAuthMode('login')
                      setAuthError(null)
                    }}
                  >
                    Войти
                  </button>
                  <button
                    className={authMode === 'register' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'register'}
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError(null)
                    }}
                  >
                    Регистрация
                  </button>
                </div>

                <form className="auth-form" onSubmit={handleAuthSubmit}>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={authEmail}
                      autoComplete="email"
                      placeholder="name@example.com"
                      required
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Пароль</span>
                    <input
                      type="password"
                      value={authPassword}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      minLength={8}
                      maxLength={128}
                      placeholder="Минимум 8 символов"
                      required
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                  </label>

                  {authError ? (
                    <p className="form-message error" role="alert">
                      {authError}
                    </p>
                  ) : null}

                  <button className="primary-button auth-submit" type="submit" disabled={authSubmitting}>
                    {authSubmitting
                      ? 'Подождите...'
                      : authMode === 'login'
                        ? 'Войти'
                        : 'Создать аккаунт'}
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="checkout-card" id="cart" aria-labelledby="cart-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Корзина</p>
                <h2 id="cart-title">Ваш заказ</h2>
              </div>
              <span className="cart-count">{selectedCount}</span>
            </div>

            {draftLines.length ? (
              <ul className="cart-list">
                {draftLines.map((line) => (
                  <li className="cart-line" key={line.id}>
                    <img src={line.image} alt="" />
                    <div>
                      <strong>{line.name}</strong>
                      <span>
                        {line.quantity} x {formatMoney(line.price)}
                      </span>
                    </div>
                    <div className="stepper" aria-label={`Количество: ${line.name}`}>
                      <button type="button" onClick={() => changeQuantity(line.id, -1)}>
                        -
                      </button>
                      <span>{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.id, 1)}>
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">Добавьте товар из каталога, чтобы оформить заказ.</p>
            )}

            <div className="total-row">
              <span>Итого</span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>

            <button
              className="primary-button"
              type="button"
              disabled={
                !draftLines.length || creatingOrder || authStatus !== 'authenticated'
              }
              onClick={handleCreateOrder}
            >
              {creatingOrder
                ? 'Оформляем...'
                : authStatus === 'authenticated'
                  ? 'Оформить заказ'
                  : 'Войдите для оформления'}
            </button>

            {orderError ? (
              <p className="form-message error" role="alert">
                {orderError}
              </p>
            ) : null}

            {currentOrder ? (
              <div className="order-receipt" aria-live="polite">
                <span>Номер заказа</span>
                <strong>{currentOrder.id}</strong>
              </div>
            ) : null}
          </section>

          <section className="status-card" id="status" aria-labelledby="status-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Статус</p>
                <h2 id="status-title">Что с заказом</h2>
              </div>
            </div>

            {currentOrder ? (
              <>
                <div className="status-summary" aria-live="polite">
                  <span>Текущее состояние</span>
                  <strong className={`status-pill ${currentOrder.status}`}>
                    {formatStatus(currentOrder.status)}
                  </strong>
                </div>

                <ol className="timeline">
                  {timeline.map((step) => (
                    <li className={`timeline-step ${step.state}`} key={step.key}>
                      <span className="timeline-marker" aria-hidden="true" />
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.description}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="empty-state">
                Здесь можно следить за состоянием оформленного заказа.
              </p>
            )}
          </section>

          <section className="history-card" aria-labelledby="history-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">История</p>
                <h2 id="history-title">Последние события</h2>
              </div>
            </div>

            {eventLog.length ? (
              <ul className="event-list">
                {eventLog.map((event) => (
                  <li className={`event-row ${event.tone}`} key={event.id}>
                    <time>{event.time}</time>
                    <div>
                      <strong>{event.title}</strong>
                      <span>{event.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">Здесь появятся последние обновления по заказу.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}

export default App
