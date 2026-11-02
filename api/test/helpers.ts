import { exports } from 'cloudflare:workers'

export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Member = { id: string; homeId: string; name: string }
export type Balance = { memberId: string; name: string; outstandingCents: number }

export async function call<Body = unknown>(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await exports.default.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: parseJson(text) as Body }
}

// A route that does not exist answers with plain text, so a failed parse gives null.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function createHome(memberNames: string[]) {
  const home = await call<{ id: string; name: string }>(
    'POST',
    '/api/homes',
    {
      body: { name: 'Test home' },
    },
  )

  // Debug API response
  console.log('Create home status:', home.status)
  console.log('Create home response:', home.body)

  if (home.status !== 201 || !home.body?.id) {
    throw new Error(
      `Home creation failed: ${JSON.stringify(home)}`,
    )
  }

  const members: Member[] = []

  for (const name of memberNames) {
    const member = await call<Member>(
      'POST',
      `/api/homes/${home.body.id}/members`,
      {
        body: { name },
      },
    )

    if (!member.body?.id) {
      throw new Error(
        `Member creation failed: ${JSON.stringify(member)}`,
      )
    }

    members.push(member.body)
  }

  return { homeId: home.body.id, members }
}

export async function createBill(homeId: string, totalCents: number) {
  return call<Bill>('POST', `/api/homes/${homeId}/bills`, {
    body: { title: 'Electricity', totalCents },
  })
}
