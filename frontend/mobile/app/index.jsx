import { Ionicons } from '@expo/vector-icons'
import { Accelerometer } from 'expo-sensors'
import * as Location from 'expo-location'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

const DEFAULT_API_URL = 'http://10.11.8.112:3000'
const DEMO_DEVICE_ID = 1

const THEMES = {
  dark: {
    bg: '#0b1220',
    card: '#121c2f',
    cardSoft: '#0f182a',
    border: '#24344f',
    borderSoft: '#253754',
    text: '#edf3ff',
    textMuted: '#9fb2d3',
    textSubtle: '#86a0c8',
    inputBg: '#0b1527',
    inputBorder: '#2a3a58',
    inputPlaceholder: '#8f9cb5',
    statusNeutralBg: '#152239',
    statusNeutralBorder: '#2d4369',
    statusSuccessBg: '#143126',
    statusSuccessBorder: '#2a7d5a',
    statusErrorBg: '#351a22',
    statusErrorBorder: '#954356',
    connectionOkBg: '#143126',
    connectionOkBorder: '#2a7d5a',
    connectionBadBg: '#351a22',
    connectionBadBorder: '#954356',
    primary: '#2f6ad9',
    danger: '#b94753',
    warningBg: '#FF8080',
    warningBorder: '#1f3355',
    warningText: '#edf3ff',
    logoutBg: '#261b21',
    logoutBorder: '#8c4656',
    logoutText: '#ffd6dd',
  },
  light: {
    bg: '#eef3fb',
    card: '#ffffff',
    cardSoft: '#f5f8ff',
    border: '#d3deef',
    borderSoft: '#d6deed',
    text: '#1f3355',
    textMuted: '#4f6488',
    textSubtle: '#62789d',
    inputBg: '#ffffff',
    inputBorder: '#c3d2e9',
    inputPlaceholder: '#8ca2c4',
    statusNeutralBg: '#e8eef9',
    statusNeutralBorder: '#c0d2ef',
    statusSuccessBg: '#dff3ea',
    statusSuccessBorder: '#9bcab1',
    statusErrorBg: '#f8e6ea',
    statusErrorBorder: '#e2a5b2',
    connectionOkBg: '#dff3ea',
    connectionOkBorder: '#97c9ae',
    connectionBadBg: '#f8e6ea',
    connectionBadBorder: '#e2a5b2',
    primary: '#2f6ad9',
    danger: '#b94753',
    warningBg: '#eef3fb',
    warningBorder: '#1f3355',
    warningText: '#1f3355',
    logoutBg: '#f9eef1',
    logoutBorder: '#dca0ad',
  },
}

const fixed = (value, digits = 3) => Number(value || 0).toFixed(digits)

const formatCoordinate = (value) => {
  if (value === null || value === undefined) return '--'
  return Number(value).toFixed(6)
}

const formatSpeed = (value) => {
  if (value === null || value === undefined) return '--'
  return Number(value).toFixed(2)
}

const formatDuration = (startIso, nowMs) => {
  if (!startIso) return '00:00'
  const start = new Date(startIso).getTime()
  if (Number.isNaN(start)) return '00:00'

  const totalSeconds = Math.max(0, Math.floor((nowMs - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const buildAccelSample = (accel) => ({
  ts: new Date().toISOString(),
  sensorType: 'accel',
  payload: {
    x: Number((accel?.x ?? 0).toFixed(3)),
    y: Number((accel?.y ?? 0).toFixed(3)),
    z: Number((accel?.z ?? 0).toFixed(3)),
  },
})

const buildGpsSample = (gps) => {
  if (gps?.latitude === null || gps?.longitude === null) {
    return null
  }

  return {
    ts: new Date().toISOString(),
    sensorType: 'gps',
    payload: {
      latitude: Number(gps.latitude.toFixed(6)),
      longitude: Number(gps.longitude.toFixed(6)),
      speed: Number((gps.speed ?? 0).toFixed(2)),
    },
  }
}

const buildHardBrakeSample = () => ({
  ts: new Date().toISOString(),
  sensorType: 'accel',
  payload: {
    x: -9.5,
    y: 0.2,
    z: 0.1,
  },
})

const parseJsonSafe = async (response) => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export default function HomeScreen() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [theme, setTheme] = useState('dark')

  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)

  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isDriving, setIsDriving] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const [statusText, setStatusText] = useState('Ready to drive')
  const [statusType, setStatusType] = useState('neutral')
  const [connectionStatus, setConnectionStatus] = useState('Disconnected')
  const [tripStartedAt, setTripStartedAt] = useState('')
  const [tripAlertsCount, setTripAlertsCount] = useState(0)
  const [clockNow, setClockNow] = useState(Date.now())

  const [loginAttempted, setLoginAttempted] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [accelerometerStatus, setAccelerometerStatus] = useState('Inactive')
  const [gpsPermissionStatus, setGpsPermissionStatus] = useState('Unknown')

  const [accelerometerValues, setAccelerometerValues] = useState({ x: 0, y: 0, z: 0 })
  const [gpsValues, setGpsValues] = useState({ latitude: null, longitude: null, speed: null })

  const latestAccelRef = useRef({ x: 0, y: 0, z: 0 })
  const latestGpsRef = useRef({ latitude: null, longitude: null, speed: null })
  const isSendingRef = useRef(false)

  const isAuthenticated = Boolean(token)
  const colors = theme === 'dark' ? THEMES.dark : THEMES.light

  const updateGpsValues = useCallback((coords) => {
    const speedKmh =
      coords?.speed === null || coords?.speed === undefined
        ? null
        : Number((coords.speed * 3.6).toFixed(2))

    const nextGps = {
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      speed: speedKmh,
    }

    latestGpsRef.current = nextGps
    setGpsValues(nextGps)
  }, [])

  const sendTelemetry = useCallback(
    async (samples, message, options = {}) => {
      const { trackTripAlert = false } = options
      if (!token || !samples.length || isSendingRef.current) return

      isSendingRef.current = true
      setIsSending(true)
      setStatusText(message)
      setStatusType('neutral')

      const requestPayload = {
        deviceId: DEMO_DEVICE_ID,
        samples,
      }

      console.log('[telemetry] POST request', {
        url: `${apiUrl}/telemetry`,
        payload: requestPayload,
      })

      try {
        const response = await fetch(`${apiUrl}/telemetry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestPayload),
        })

        const data = await parseJsonSafe(response)

        console.log('[telemetry] response', {
          status: response.status,
          ok: response.ok,
          body: data,
        })

        setConnectionStatus('Connected')

        if (!response.ok) {
          const httpError = new Error(data?.error || `Telemetry request failed (${response.status})`)
          httpError.isHttpError = true
          throw httpError
        }

        const accelSample = samples.find((sample) => sample.sensorType === 'accel')
        const alarmCount = Number(data?.alarms || 0)

        if (trackTripAlert && alarmCount > 0) {
          setTripAlertsCount((prev) => prev + alarmCount)
        }
        setStatusText(
          `Telemetry sent (x=${accelSample?.payload?.x ?? 'n/a'}). Alarms: ${alarmCount}.`,
        )
        setStatusType('success')
      } catch (error) {
        if (error?.isHttpError) {
          console.warn('[telemetry] request rejected by backend', {
            message: error.message,
          })
        } else {
          console.error('[telemetry] fetch/network failure', error)
          setConnectionStatus('Disconnected')
        }
        setStatusText(error.message || 'Telemetry send error')
        setStatusType('error')
      } finally {
        isSendingRef.current = false
        setIsSending(false)
      }
    },
    [apiUrl, token],
  )

  const buildSamples = useCallback((accelSample) => {
    const gpsSample = buildGpsSample(latestGpsRef.current)
    return gpsSample ? [accelSample, gpsSample] : [accelSample]
  }, [])

  const handleLogin = async () => {
    setLoginAttempted(true)
    setLoginError('')

    if (!email || !password || !apiUrl) {
      setLoginError('Invalid email or password')
      return
    }

    setIsLoggingIn(true)

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok || !data?.token) {
        throw new Error('Invalid email or password')
      }

      setToken(data.token)
      setUser(data.user || null)
      setConnectionStatus('Connected')
      setLoginError('')
      setStatusText('Ready to drive')
      setStatusType('neutral')
    } catch {
      setConnectionStatus('Disconnected')
      setLoginError('Invalid email or password')
    } finally {
      setIsLoggingIn(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setAccelerometerStatus('Inactive')
      return undefined
    }

    let isMounted = true
    let subscription

    const startAccelerometer = async () => {
      try {
        const available = await Accelerometer.isAvailableAsync()

        if (!isMounted) return

        if (!available) {
          setAccelerometerStatus('Unavailable')
          return
        }

        Accelerometer.setUpdateInterval(250)
        setAccelerometerStatus('Active')

        subscription = Accelerometer.addListener((reading) => {
          const next = {
            x: Number(reading.x.toFixed(3)),
            y: Number(reading.y.toFixed(3)),
            z: Number(reading.z.toFixed(3)),
          }

          latestAccelRef.current = next
          setAccelerometerValues(next)
        })
      } catch {
        if (isMounted) {
          setAccelerometerStatus('Error')
        }
      }
    }

    startAccelerometer()

    return () => {
      isMounted = false
      if (subscription) subscription.remove()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setGpsPermissionStatus('Unknown')
      latestGpsRef.current = { latitude: null, longitude: null, speed: null }
      setGpsValues({ latitude: null, longitude: null, speed: null })
      return undefined
    }

    let isMounted = true
    let locationSubscription

    const startLocation = async () => {
      try {
        setGpsPermissionStatus('Requesting')

        const servicesEnabled = await Location.hasServicesEnabledAsync()
        if (!servicesEnabled) {
          if (isMounted) setGpsPermissionStatus('Services Off')
          return
        }

        const permission = await Location.requestForegroundPermissionsAsync()
        if (!isMounted) return

        if (permission.status !== 'granted') {
          setGpsPermissionStatus('Denied')
          return
        }

        setGpsPermissionStatus('Granted')

        const lastKnown = await Location.getLastKnownPositionAsync()
        if (lastKnown?.coords) {
          updateGpsValues(lastKnown.coords)
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (location) => {
            updateGpsValues(location.coords)
          },
        )
      } catch {
        if (isMounted) {
          setGpsPermissionStatus('Unavailable')
        }
      }
    }

    startLocation()

    return () => {
      isMounted = false
      if (locationSubscription) locationSubscription.remove()
    }
  }, [isAuthenticated, updateGpsValues])

  const handleStartDriving = async () => {
    setTripStartedAt(new Date().toISOString())
    setTripAlertsCount(0)
    setIsDriving(true)
    const accelSample = buildAccelSample(latestAccelRef.current)
    await sendTelemetry(buildSamples(accelSample), 'Starting drive and sending first telemetry...', {
      trackTripAlert: true,
    })
  }

  const handleStopDriving = () => {
    setIsDriving(false)
    setTripStartedAt('')
    setStatusText('Driving stopped.')
    setStatusType('neutral')
  }

  const handleLogout = () => {
    setToken('')
    setUser(null)
    setIsDriving(false)
    setTripStartedAt('')
    setTripAlertsCount(0)
    setConnectionStatus('Disconnected')
    setStatusText('Ready to drive')
    setStatusType('neutral')
    setLoginAttempted(false)
    setLoginError('')
  }

  const handleHardBrakeTest = async () => {
    const hardBrakeSample = buildHardBrakeSample()
    await sendTelemetry(buildSamples(hardBrakeSample), 'Sending hard brake test telemetry...', {
      trackTripAlert: isDriving,
    })
  }

  useEffect(() => {
    if (!isDriving || !token) return undefined

    const intervalId = setInterval(() => {
      const accelSample = buildAccelSample(latestAccelRef.current)
      sendTelemetry(buildSamples(accelSample), 'Sending accelerometer + GPS telemetry...', {
        trackTripAlert: true,
      })
    }, 2000)

    return () => clearInterval(intervalId)
  }, [buildSamples, isDriving, sendTelemetry, token])

  useEffect(() => {
    if (!isDriving) return undefined
    const tick = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [isDriving])

  const statusStyle = useMemo(() => {
    if (statusType === 'success') return styles.statusSuccess
    if (statusType === 'error') return styles.statusError
    return styles.statusNeutral
  }, [statusType])

  const connectionStyle = useMemo(() => {
    return connectionStatus === 'Connected' ? styles.connectionSuccess : styles.connectionError
  }, [connectionStatus])

  const sensorsStatus = useMemo(() => {
    if (accelerometerStatus !== 'Active') return 'Limited'
    if (gpsPermissionStatus === 'Granted') return 'Active'
    if (gpsPermissionStatus === 'Requesting') return 'Starting'
    return 'Partial'
  }, [accelerometerStatus, gpsPermissionStatus])

  const driveStatusText = useMemo(() => (isDriving ? 'Driving' : 'Stopped'), [isDriving])

  const tripDurationText = useMemo(() => formatDuration(tripStartedAt, clockNow), [clockNow, tripStartedAt])

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.centeredContainer} keyboardShouldPersistTaps="handled">
          <Image
              style={styles.loginLogo}
              source={require('../assets/images/logo.png')}
              resizeMode="contain"
            />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Safe Driving Mobile</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to start your driving session</Text>

            <Text style={[styles.label, { color: colors.textSubtle }]}>Backend URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="http://10.11.8.112:3000"
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              value={apiUrl}
              onChangeText={setApiUrl}
            />

            <Text style={[styles.hintText, { color: colors.textMuted }]}>Use your Mac IP for Expo Go on iPhone.</Text>

            <Text style={[styles.label, { color: colors.textSubtle }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="student@university.edu"
              placeholderTextColor={colors.inputPlaceholder}
              value={email}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
            />

            <Text style={[styles.label, { color: colors.textSubtle }]}>Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="••••••••"
              placeholderTextColor={colors.inputPlaceholder}
              value={password}
              secureTextEntry
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[styles.loginPrimaryButton, { backgroundColor: colors.primary }]}
              onPress={handleLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            {loginAttempted && Boolean(loginError) && (
              <View style={[styles.statusBox, styles.statusError, { backgroundColor: colors.statusErrorBg, borderColor: colors.statusErrorBorder }]}>
                <Text style={[styles.statusText, { color: colors.text }]}>{loginError}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <View style={styles.sessionContainer}>
        <View style={styles.sessionHeader}>
          <Text style={[styles.userCompactText, { color: colors.textMuted }]}>{user?.email || 'Unknown user'}</Text>
          <TouchableOpacity
            style={[styles.themeIconButton, { borderColor: colors.border, backgroundColor: colors.cardSoft }]}
            onPress={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            accessibilityLabel="Toggle theme"
          >
            <Ionicons
              name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.titleCompact, { color: colors.text }]}>Driving Session</Text>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}>
              <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Connection</Text>
              <View
                style={[
                  styles.connectionBadge,
                  connectionStyle,
                  connectionStatus === 'Connected'
                    ? { backgroundColor: colors.connectionOkBg, borderColor: colors.connectionOkBorder }
                    : { backgroundColor: colors.connectionBadBg, borderColor: colors.connectionBadBorder },
                ]}
              >
                <Text style={[styles.connectionText, { color: colors.text }]}>{connectionStatus}</Text>
              </View>
            </View>

            <View style={[styles.metricCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}>
              <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Sensors</Text>
              <Text style={[styles.metricValue, { color: colors.text }]}>{sensorsStatus}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}>
              <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Speed</Text>
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatSpeed(gpsValues.speed)} km/h</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}>
              <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Drive</Text>
              <Text style={[styles.metricValue, { color: colors.text }]}>{driveStatusText}</Text>
            </View>
          </View>

          <View style={[styles.dataCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}> 
            <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Accel X/Y/Z</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}> 
              {fixed(accelerometerValues.x)} / {fixed(accelerometerValues.y)} / {fixed(accelerometerValues.z)}
            </Text>
          </View>

          <View style={[styles.dataCard, { backgroundColor: colors.cardSoft, borderColor: colors.borderSoft }]}> 
            <Text style={[styles.metricLabel, { color: colors.textSubtle }]}>Location</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}> 
              {formatCoordinate(gpsValues.latitude)}, {formatCoordinate(gpsValues.longitude)}
            </Text>
          </View>

          {isDriving && (
            <View style={[styles.tripCard, { borderColor: colors.borderSoft, backgroundColor: colors.cardSoft }]}> 
              <Text style={[styles.tripTitle, { color: colors.textMuted }]}>Trip Active</Text>
              <View style={styles.tripStatsRow}>
                <Text style={[styles.tripStat, { color: colors.text }]}>Duration: {tripDurationText}</Text>
                <Text style={[styles.tripStat, { color: colors.text }]}>Alerts: {tripAlertsCount}</Text>
              </View>
            </View>
          )}

          {!isDriving ? (
            <TouchableOpacity
              style={[styles.primaryButtonLarge, { backgroundColor: colors.primary }]}
              onPress={handleStartDriving}
              disabled={isSending}
            >
              <Text style={styles.primaryButtonText}>Start Driving</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.dangerButtonLarge, { backgroundColor: colors.danger }]} onPress={handleStopDriving}>
              <Text style={styles.primaryButtonText}>Stop Driving</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.warningButton, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}
            onPress={handleHardBrakeTest}
            disabled={isSending}
          >
            <Text style={[styles.warningButtonText, { color: colors.warningText }]}>Hard Brake Test</Text>
          </TouchableOpacity>

          <View
            style={[
              styles.statusBox,
              statusStyle,
              statusType === 'success'
                ? { backgroundColor: colors.statusSuccessBg, borderColor: colors.statusSuccessBorder }
                : statusType === 'error'
                  ? { backgroundColor: colors.statusErrorBg, borderColor: colors.statusErrorBorder }
                  : { backgroundColor: colors.statusNeutralBg, borderColor: colors.statusNeutralBorder },
            ]}
          >
            <Text style={[styles.statusText, { color: colors.text }]}>{statusText}</Text>
          </View>

          <TouchableOpacity
            style={[styles.logoutBottomButton, { backgroundColor: colors.logoutBg, borderColor: colors.logoutBorder }]}
            onPress={handleLogout}
          >
            <Text style={[styles.logoutBottomText, { color: colors.logoutText }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centeredContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  sessionContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  userCompactText: {
    fontSize: 17,
    flex: 1,
    marginRight: 8,
  },
  themeIconButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  loginLogo: {
    width: 100,
    height:100,
    alignSelf: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  titleCompact: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 8,
  },
  hintText: {
    fontSize: 12,
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  loginPrimaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 52,
    marginTop: 8,
  },
  primaryButtonLarge: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 52,
    marginTop: 4,
  },
  dangerButtonLarge: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 52,
    marginTop: 4,
  },
  warningButton: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    minHeight: 48,
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  warningButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  connectionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  connectionSuccess: {},
  connectionError: {},
  connectionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 70,
    justifyContent: 'space-between',
  },
  dataCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  tripCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  tripTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  tripStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tripStat: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBox: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginTop: 7,
  },
  statusNeutral: {},
  statusSuccess: {},
  statusError: {},
  statusText: {
    fontSize: 12,
  },
  logoutBottomButton: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    minHeight: 46,
    marginTop: 8,
  },
  logoutBottomText: {
    fontWeight: '700',
    fontSize: 14,
  },
})
