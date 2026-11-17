import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const allowedOrigins = new Set([
  'https://ivory37goku.github.io',
  'https://appassets.androidplatform.net'
])

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = allowedOrigins.has(origin) ? origin : 'https://ivory37goku.github.io'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  })
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function cleanNumber(value: unknown, maximum = 1_000_000_000) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(maximum, number)) : 0
}

function publicPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La propuesta no tiene un formato válido.')
  const source = value as Record<string, any>
  if (source.version !== 1 || !source.quote || typeof source.quote !== 'object') throw new Error('La propuesta no tiene un formato compatible.')
  const company = source.company && typeof source.company === 'object' ? source.company : {}
  const quote = source.quote as Record<string, any>
  const brand = company.brand && typeof company.brand === 'object' ? company.brand : {}
  const solar = source.solar && typeof source.solar === 'object' ? source.solar : null
  const payload = {
    version: 1,
    company: {
      name: cleanText(company.name, 120),
      phone: cleanText(company.phone, 80),
      email: cleanText(company.email, 160),
      brand: {
        appName: cleanText(brand.appName, 40),
        primaryColor: /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : '#A6D94A',
        secondaryColor: /^#[0-9a-f]{6}$/i.test(brand.secondaryColor) ? brand.secondaryColor : '#557C35',
        monogram: cleanText(brand.monogram, 3),
        iconShape: ['circle', 'square', 'rounded'].includes(brand.iconShape) ? brand.iconShape : 'rounded'
      }
    },
    clientName: cleanText(source.clientName, 160),
    quote: {
      title: cleanText(quote.title, 250),
      number: cleanText(quote.number, 80),
      date: cleanText(quote.date, 40),
      validUntil: cleanText(quote.validUntil, 40),
      taxName: cleanText(quote.taxName, 30) || 'IGIC',
      taxRate: cleanNumber(quote.taxRate, 100),
      amount: cleanNumber(quote.amount),
      total: cleanNumber(quote.total),
      clientTerms: cleanText(quote.clientTerms, 6000),
      items: Array.isArray(quote.items) ? quote.items.slice(0, 500).map((line: Record<string, any>) => ({
        category: cleanText(line?.category, 80),
        description: cleanText(line?.description, 500),
        quantity: cleanNumber(line?.quantity),
        unit: cleanText(line?.unit, 60),
        unitPrice: cleanNumber(line?.unitPrice),
        amount: cleanNumber(line?.amount)
      })) : []
    },
    solar: solar ? {
      annualKwh: cleanNumber(solar.annualKwh),
      specificYield: cleanNumber(solar.specificYield),
      annualIrradiation: cleanNumber(solar.annualIrradiation),
      peakPower: cleanNumber(solar.peakPower, 1000),
      monthly: Array.isArray(solar.monthly) ? solar.monthly.slice(0, 12).map((row: Record<string, any>) => ({
        month: Math.max(1, Math.min(12, Math.floor(cleanNumber(row?.month, 12)))),
        energyKwh: cleanNumber(row?.energyKwh)
      })) : []
    } : null
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 180_000) throw new Error('La propuesta es demasiado grande para compartirla como enlace.')
  return payload
}

function tokenString() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  bytes.forEach(value => { binary += String.fromCharCode(value) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  if (!match) return null
  const { data, error } = await authClient.auth.getUser(match[1])
  return error ? null : data.user
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? ''
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(req, { error: 'Enlace no disponible.' }, 404)
      const tokenHash = await hashToken(token)
      const { data, error } = await admin.from('gestion_clientes_quote_shares')
        .select('payload, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle()
      if (error) throw error
      if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
        return json(req, { error: 'Este enlace ha caducado o se ha revocado.' }, 404)
      }
      return json(req, { payload: data.payload })
    }

    if (req.method !== 'POST') return json(req, { error: 'Método no permitido.' }, 405)
    const user = await authenticatedUser(req)
    if (!user) return json(req, { error: 'Inicia sesión para gestionar enlaces.' }, 401)
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 250_000) return json(req, { error: 'La solicitud es demasiado grande.' }, 413)
    const body = await req.json().catch(() => null) as Record<string, any> | null
    if (!body || typeof body !== 'object') return json(req, { error: 'Solicitud no válida.' }, 400)

    if (body.action === 'create') {
      const quoteId = cleanText(body.quoteId, 160)
      if (!quoteId) return json(req, { error: 'Falta el identificador del presupuesto.' }, 400)
      const payload = publicPayload(body.payload)
      const { count, error: countError } = await admin.from('gestion_clientes_quote_shares')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('quote_id', quoteId)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
      if (countError) throw countError
      if ((count ?? 0) >= 30) return json(req, { error: 'Este presupuesto ya tiene 30 enlaces activos. Revoca alguno antes de crear otro.' }, 429)
      const token = tokenString()
      const tokenHash = await hashToken(token)
      const days = Math.max(1, Math.min(365, Math.floor(cleanNumber(body.expiresInDays, 365)) || 90))
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await admin.from('gestion_clientes_quote_shares').insert({
        owner_id: user.id,
        quote_id: quoteId,
        token_hash: tokenHash,
        payload,
        expires_at: expiresAt
      }).select('id, expires_at').single()
      if (error) throw error
      return json(req, { id: data.id, token, expiresAt: data.expires_at }, 201)
    }

    if (body.action === 'revoke') {
      const shareId = cleanText(body.shareId, 80)
      if (!/^[0-9a-f-]{36}$/i.test(shareId)) return json(req, { error: 'Identificador de enlace no válido.' }, 400)
      const { data, error } = await admin.from('gestion_clientes_quote_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', shareId)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return data ? json(req, { revoked: true }) : json(req, { error: 'No se encontró el enlace activo.' }, 404)
    }

    return json(req, { error: 'Acción no reconocida.' }, 400)
  } catch (error) {
    console.error('quote-share request failed', error)
    return json(req, { error: 'No se pudo procesar la solicitud.' }, 500)
  }
})
