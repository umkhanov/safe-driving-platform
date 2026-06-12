const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const TOKEN_KEY = 'safeDrivingToken'
const USER_KEY = 'safeDrivingUser'

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const parseResponse = async (response) => {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const request = async (path, { method = 'GET', token, body } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await parseResponse(response)

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`
    throw new ApiError(message, response.status)
  }

  return data
}

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export const login = async ({ email, password }) => {
  return request('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export const getAlarms = async (token, filters = {}) => {
  return request(`/alarms${buildQueryString(filters)}`, { token })
}

export const getDevices = async (token) => {
  return request('/devices', { token })
}

export const getVehicles = async (token) => {
  return request('/vehicles', { token })
}

export const getVehicleById = async (token, id) => {
  return request(`/vehicles/${id}`, { token })
}

export const getTrips = async (token, filters = {}) => {
  return request(`/trips${buildQueryString(filters)}`, { token })
}

export const getTripById = async (token, id) => {
  return request(`/trips/${id}`, { token })
}

export const createDevice = async (token, label) => {
  return request('/devices', {
    method: 'POST',
    token,
    body: { label },
  })
}

export const postTelemetry = async (token, payload) => {
  return request('/telemetry', {
    method: 'POST',
    token,
    body: payload,
  })
}

export const saveAuth = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export const getStoredAuth = () => {
  const token = localStorage.getItem(TOKEN_KEY)
  const rawUser = localStorage.getItem(USER_KEY)

  if (!token || !rawUser) {
    return { token: null, user: null }
  }

  try {
    const user = JSON.parse(rawUser)
    return { token, user }
  } catch {
    clearAuth()
    return { token: null, user: null }
  }
}

export { API_BASE_URL, ApiError }
