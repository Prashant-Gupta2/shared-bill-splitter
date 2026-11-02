
import { Hono } from 'hono'

type Env = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()
// Create a home
app.post('/api/homes', async (c) => {
  const body = await c.req.json<{ name?: unknown }>()

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Home name is required' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB
    .prepare('INSERT INTO homes (id, name) VALUES (?, ?)')
    .bind(id, name)
    .run()

  return c.json({ id, name }, 201)
})

// Create a member
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB
    .prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const body = await c.req.json<{ name?: unknown }>()

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Member name is required' }, 422)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB
    .prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create a bill and split it between all home members
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB
    .prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const body = await c.req.json<{
    title?: unknown
    totalCents?: unknown
  }>()

  if (
    typeof body.title !== 'string' ||
    body.title.trim().length === 0
  ) {
    return c.json({ error: 'Bill title is required' }, 422)
  }

  if (
    typeof body.totalCents !== 'number' ||
    !Number.isInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'Invalid bill amount' }, 422)
  }

  const members = await c.env.DB
    .prepare(
      'SELECT id FROM members WHERE home_id = ? ORDER BY rowid ASC',
    )
    .bind(homeId)
    .all<{ id: string }>()

  if (members.results.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const title = body.title.trim()
  const totalCents = body.totalCents

  const count = members.results.length
  const baseAmount = Math.floor(totalCents / count)
  const remainder = totalCents % count

  const shares = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  const statements = [
    c.env.DB
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
      )
      .bind(billId, homeId, title, totalCents),

    ...shares.map((share) =>
      c.env.DB
        .prepare(
          'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
        )
        .bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})
// Get outstanding balances for all members in a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB
    .prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB
    .prepare(`
      SELECT
        m.id AS memberId,
        m.name AS name,
        COALESCE(
          SUM(
            CASE
              WHEN b.id IS NOT NULL AND s.paid_at IS NULL
              THEN s.amount_cents
              ELSE 0
            END
          ),
          0
        ) AS outstandingCents
      FROM members m
      LEFT JOIN shares s ON s.member_id = m.id
      LEFT JOIN bills b
        ON b.id = s.bill_id AND b.home_id = m.home_id
      WHERE m.home_id = ?
      GROUP BY m.id, m.name
      ORDER BY m.rowid ASC
    `)
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json({ balances: result.results }, 200)
})

// Pay a share
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const key = c.req.header('Idempotency-Key')?.trim()

  if (!key) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const bill = await c.env.DB
    .prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  const share = await c.env.DB
    .prepare(`
      SELECT
        id,
        member_id AS memberId,
        amount_cents AS amountCents,
        paid_at AS paidAt,
        idempotency_key AS idempotencyKey
      FROM shares
      WHERE id = ? AND bill_id = ?
    `)
    .bind(shareId, billId)
    .first<{
      id: string
      memberId: string
      amountCents: number
      paidAt: string | null
      idempotencyKey: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  if (share.paidAt) {
    if (share.idempotencyKey === key) {
      return c.json({
        id: share.id,
        memberId: share.memberId,
        amountCents: share.amountCents,
        paidAt: share.paidAt,
      }, 200)
    }

    return c.json({ error: 'Share already paid' }, 409)
  }

  const paidAt = new Date().toISOString()

  const result = await c.env.DB
    .prepare(`
      UPDATE shares
      SET paid_at = ?, idempotency_key = ?
      WHERE id = ? AND bill_id = ? AND paid_at IS NULL
    `)
    .bind(paidAt, key, shareId, billId)
    .run()

  if (result.meta.changes === 0) {
    const latest = await c.env.DB
      .prepare(`
        SELECT
          id,
          member_id AS memberId,
          amount_cents AS amountCents,
          paid_at AS paidAt,
          idempotency_key AS idempotencyKey
        FROM shares
        WHERE id = ? AND bill_id = ?
      `)
      .bind(shareId, billId)
      .first<{
        id: string
        memberId: string
        amountCents: number
        paidAt: string | null
        idempotencyKey: string | null
      }>()

    if (latest?.paidAt && latest.idempotencyKey === key) {
      return c.json({
        id: latest.id,
        memberId: latest.memberId,
        amountCents: latest.amountCents,
        paidAt: latest.paidAt,
      }, 200)
    }

    return c.json({ error: 'Share already paid' }, 409)
  }

  return c.json({
    id: share.id,
    memberId: share.memberId,
    amountCents: share.amountCents,
    paidAt,
  }, 200)
})

export default app