[1mdiff --git a/web/src/routes/index.tsx b/web/src/routes/index.tsx[m
[1mindex ae38378..fb4d2a9 100644[m
[1m--- a/web/src/routes/index.tsx[m
[1m+++ b/web/src/routes/index.tsx[m
[36m@@ -1,16 +1,147 @@[m
[31m-import { createFileRoute } from '@tanstack/react-router'[m
 [m
[31m-export const Route = createFileRoute('/')({[m
[31m-  component: Home,[m
[32m+[m[32mimport { Hono } from 'hono'[m
[32m+[m
[32m+[m[32mtype Env = {[m
[32m+[m[32m  DB: D1Database[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mconst app = new Hono<{ Bindings: Env }>()[m
[32m+[m
[32m+[m[32m// 1. Create a home[m
[32m+[m[32mapp.post('/api/homes', async (c) => {[m
[32m+[m[32m  const body = await c.req.json<{ name?: unknown }>()[m
[32m+[m
[32m+[m[32m  if (typeof body.name !== 'string' || !body.name.trim()) {[m
[32m+[m[32m    return c.json({ error: 'Home name is required' }, 422)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const id = crypto.randomUUID()[m
[32m+[m[32m  const name = body.name.trim()[m
[32m+[m
[32m+[m[32m  await c.env.DB[m
[32m+[m[32m    .prepare('INSERT INTO homes (id, name) VALUES (?, ?)')[m
[32m+[m[32m    .bind(id, name)[m
[32m+[m[32m    .run()[m
[32m+[m
[32m+[m[32m  return c.json({ id, name }, 201)[m
[32m+[m[32m})[m
[32m+[m
[32m+[m[32m// 2. Add a member[m
[32m+[m[32mapp.post('/api/homes/:homeId/members', async (c) => {[m
[32m+[m[32m  const homeId = c.req.param('homeId')[m
[32m+[m
[32m+[m[32m  const home = await c.env.DB[m
[32m+[m[32m    .prepare('SELECT id FROM homes WHERE id = ?')[m
[32m+[m[32m    .bind(homeId)[m
[32m+[m[32m    .first()[m
[32m+[m
[32m+[m[32m  if (!home) {[m
[32m+[m[32m    return c.json({ error: 'Home not found' }, 404)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const body = await c.req.json<{ name?: unknown }>()[m
[32m+[m
[32m+[m[32m  if (typeof body.name !== 'string' || !body.name.trim()) {[m
[32m+[m[32m    return c.json({ error: 'Member name is required' }, 422)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const id = crypto.randomUUID()[m
[32m+[m[32m  const name = body.name.trim()[m
[32m+[m
[32m+[m[32m  await c.env.DB[m
[32m+[m[32m    .prepare([m
[32m+[m[32m      'INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)'[m
[32m+[m[32m    )[m
[32m+[m[32m    .bind(id, homeId, name)[m
[32m+[m[32m    .run()[m
[32m+[m
[32m+[m[32m  return c.json({ id, homeId, name }, 201)[m
 })[m
 [m
[31m-function Home() {[m
[31m-  return ([m
[31m-    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>[m
[31m-      <h1>Bill Splitter — starter</h1>[m
[31m-      <p>[m
[31m-        Replace this with the app. See <code>README.md</code> at the repo root.[m
[31m-      </p>[m
[31m-    </main>[m
[32m+[m[32m// 3. Create a bill[m
[32m+[m[32mapp.post('/api/homes/:homeId/bills', async (c) => {[m
[32m+[m[32m  const homeId = c.req.param('homeId')[m
[32m+[m
[32m+[m[32m  const home = await c.env.DB[m
[32m+[m[32m    .prepare('SELECT id FROM homes WHERE id = ?')[m
[32m+[m[32m    .bind(homeId)[m
[32m+[m[32m    .first()[m
[32m+[m
[32m+[m[32m  if (!home) {[m
[32m+[m[32m    return c.json({ error: 'Home not found' }, 404)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const body = await c.req.json<{[m
[32m+[m[32m    title?: unknown[m
[32m+[m[32m    totalCents?: unknown[m
[32m+[m[32m  }>()[m
[32m+[m
[32m+[m[32m  if (typeof body.title !== 'string' || !body.title.trim()) {[m
[32m+[m[32m    return c.json({ error: 'Bill title is required' }, 422)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if ([m
[32m+[m[32m    typeof body.totalCents !== 'number' ||[m
[32m+[m[32m    !Number.isInteger(body.totalCents) ||[m
[32m+[m[32m    body.totalCents <= 0[m
[32m+[m[32m  ) {[m
[32m+[m[32m    return c.json({ error: 'Invalid bill amount' }, 422)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const members = await c.env.DB[m
[32m+[m[32m    .prepare([m
[32m+[m[32m      'SELECT id FROM members WHERE home_id = ? ORDER BY rowid ASC'[m
[32m+[m[32m    )[m
[32m+[m[32m    .bind(homeId)[m
[32m+[m[32m    .all<{ id: string }>()[m
[32m+[m
[32m+[m[32m  if (members.results.length === 0) {[m
[32m+[m[32m    return c.json({ error: 'Home has no members' }, 422)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const billId = crypto.randomUUID()[m
[32m+[m[32m  const title = body.title.trim()[m
[32m+[m[32m  const totalCents = body.totalCents[m
[32m+[m
[32m+[m[32m  const count = members.results.length[m
[32m+[m[32m  const baseAmount = Math.floor(totalCents / count)[m
[32m+[m[32m  const remainder = totalCents % count[m
[32m+[m
[32m+[m[32m  const shares = members.results.map((member, index) => ({[m
[32m+[m[32m    id: crypto.randomUUID(),[m
[32m+[m[32m    memberId: member.id,[m
[32m+[m[32m    amountCents: baseAmount + (index < remainder ? 1 : 0),[m
[32m+[m[32m    paidAt: null,[m
[32m+[m[32m  }))[m
[32m+[m
[32m+[m[32m  const statements = [[m
[32m+[m[32m    c.env.DB[m
[32m+[m[32m      .prepare([m
[32m+[m[32m        'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)'[m
[32m+[m[32m      )[m
[32m+[m[32m      .bind(billId, homeId, title, totalCents),[m
[32m+[m
[32m+[m[32m    ...shares.map((share) =>[m
[32m+[m[32m      c.env.DB[m
[32m+[m[32m        .prepare([m
[32m+[m[32m          'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)'[m
[32m+[m[32m        )[m
[32m+[m[32m        .bind(share.id, billId, share.memberId, share.amountCents)[m
[32m+[m[32m    ),[m
[32m+[m[32m  ][m
[32m+[m
[32m+[m[32m  await c.env.DB.batch(statements)[m
[32m+[m
[32m+[m[32m  return c.json([m
[32m+[m[32m    {[m
[32m+[m[32m      id: billId,[m
[32m+[m[32m      homeId,[m
[32m+[m[32m      title,[m
[32m+[m[32m      totalCents,[m
[32m+[m[32m      shares,[m
[32m+[m[32m    },[m
[32m+[m[32m    201[m
   )[m
[31m-}[m
[32m+[m[32m})[m
[32m+[m
[32m+[m[32mexport default app[m
