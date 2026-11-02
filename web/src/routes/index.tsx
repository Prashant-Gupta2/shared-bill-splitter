import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import '../styles.css'

export const Route = createFileRoute('/')({
  component: Home,
})

type Member = {
  id: string
  homeId: string
  name: string
}

type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`)
  }

  return data as T
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(cents / 100)
}

function Home() {
  const [home, setHome] = useState<{ id: string; name: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [homeName, setHomeName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')

  const [loading, setLoading] = useState(false)
  const [payingShare, setPayingShare] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Keep the same key when retrying an uncertain payment.
  const [paymentKeys, setPaymentKeys] = useState<Record<string, string>>({})

  async function refreshBalances(homeId: string) {
    const result = await apiRequest<Balance[]>(
      `/api/homes/${homeId}/balances`,
    )
    setBalances(result)
  }

  async function createHome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await apiRequest<{ id: string; name: string }>(
        '/api/homes',
        {
          method: 'POST',
          body: JSON.stringify({ name: homeName }),
        },
      )

      setHome(result)
      setHomeName('')
      setMembers([])
      setBills([])
      setBalances([])
      setMessage('Your home has been created successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create home.')
    } finally {
      setLoading(false)
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!home) return

    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await apiRequest<Member>(
        `/api/homes/${home.id}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ name: memberName }),
        },
      )

      setMembers((current) => [...current, result])
      setMemberName('')
      await refreshBalances(home.id)
      setMessage(`${result.name} has been added.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.')
    } finally {
      setLoading(false)
    }
  }

  async function createBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!home) return

    setError('')
    setMessage('')

    const amount = Number(billAmount)

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a valid positive amount in paise (cents).')
      return
    }

    setLoading(true)

    try {
      const result = await apiRequest<Bill>(
        `/api/homes/${home.id}/bills`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: billTitle,
            totalCents: amount,
          }),
        },
      )

      setBills((current) => [result, ...current])
      setBillTitle('')
      setBillAmount('')
      await refreshBalances(home.id)
      setMessage('Bill created and split successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create bill.')
    } finally {
      setLoading(false)
    }
  }

  async function payShare(billId: string, shareId: string) {
    if (!home) return

    setError('')
    setMessage('')
    setPayingShare(shareId)

    const key =
      paymentKeys[shareId] || crypto.randomUUID()

    setPaymentKeys((current) => ({
      ...current,
      [shareId]: key,
    }))

    try {
      const result = await apiRequest<{
        id: string
        memberId: string
        amountCents: number
        paidAt: string
      }>(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': key,
        },
      })

      setBills((current) =>
        current.map((bill) =>
          bill.id !== billId
            ? bill
            : {
                ...bill,
                shares: bill.shares.map((share) =>
                  share.id === shareId
                    ? { ...share, paidAt: result.paidAt }
                    : share,
                ),
              },
        ),
      )

      await refreshBalances(home.id)
      setPaymentKeys((current) => {
        const updated = { ...current }
        delete updated[shareId]
        return updated
      })
      setMessage('Payment recorded successfully.')
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Your share has not been marked as paid. You can retry safely.`
          : 'Payment failed. Please try again.',
      )
    } finally {
      setPayingShare(null)
    }
  }

  const totalBills = bills.reduce((sum, bill) => sum + bill.totalCents, 0)
  const totalOutstanding = balances.reduce(
    (sum, balance) => sum + balance.outstandingCents,
    0,
  )
  const paidShares = bills.reduce(
    (sum, bill) => sum + bill.shares.filter((share) => share.paidAt).length,
    0,
  )
  const totalShares = bills.reduce(
    (sum, bill) => sum + bill.shares.length,
    0,
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">₹</span>
          <span>Split<span className="brand-light">Mate</span></span>
        </a>
        <span className="topbar-label">SHARED EXPENSES, SIMPLIFIED</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">YOUR SHARED SPACE</p>
          <h1>Good things are better <span>shared.</span></h1>
          <p className="hero-description">
            Track household expenses, split bills fairly, and keep everyone
            on the same page.
          </p>
        </div>
        <div className="hero-decoration" aria-hidden="true">
          <span>₹</span>
        </div>
      </section>

      {error && (
        <div className="notice error-notice" role="alert">
          <span>!</span>
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {message && (
        <div className="notice success-notice" role="status">
          <span>✓</span>
          {message}
          <button onClick={() => setMessage('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      {!home ? (
        <section className="setup-card">
          <div className="section-icon">⌂</div>
          <p className="eyebrow">GET STARTED</p>
          <h2>Create your shared home</h2>
          <p className="muted">
            Start by giving your home or group a name. You can add members
            and start splitting bills next.
          </p>
          <form onSubmit={createHome} className="form-stack">
            <label htmlFor="homeName">Home or group name</label>
            <input
              id="homeName"
              value={homeName}
              onChange={(event) => setHomeName(event.target.value)}
              placeholder="e.g. Flat 204, Roommates"
              required
              maxLength={100}
            />
            <button className="primary-button" disabled={loading}>
              {loading ? 'Creating...' : 'Create my home'}
              <span>→</span>
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="home-heading">
            <div>
              <p className="eyebrow">CURRENT HOME</p>
              <h2>{home.name}</h2>
              <p className="muted">Manage your group expenses in one place.</p>
            </div>
            <span className="active-tag"><span /> Active home</span>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <span className="stat-icon purple">₹</span>
              <p>Total bills</p>
              <h3>{formatMoney(totalBills)}</h3>
            </article>
            <article className="stat-card">
              <span className="stat-icon orange">↗</span>
              <p>Outstanding</p>
              <h3>{formatMoney(totalOutstanding)}</h3>
            </article>
            <article className="stat-card">
              <span className="stat-icon green">✓</span>
              <p>Payments completed</p>
              <h3>{paidShares} <small>/ {totalShares}</small></h3>
            </article>
            <article className="stat-card">
              <span className="stat-icon blue">♙</span>
              <p>Group members</p>
              <h3>{members.length}</h3>
            </article>
          </section>

          <section className="content-grid">
            <div className="main-column">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">GROUP</p>
                    <h3>Members <span className="count">{members.length}</span></h3>
                  </div>
                </div>

                <form onSubmit={addMember} className="inline-form">
                  <input
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    placeholder="Enter member name"
                    aria-label="Member name"
                    required
                    maxLength={100}
                  />
                  <button className="primary-button" disabled={loading}>
                    + Add
                  </button>
                </form>

                {members.length === 0 ? (
                  <p className="empty-state">
                    No members yet. Add your first group member.
                  </p>
                ) : (
                  <div className="member-list">
                    {members.map((member, index) => (
                      <div className="member-row" key={member.id}>
                        <span className={`avatar avatar-${index % 5}`}>
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="member-name">{member.name}</span>
                        <span className="member-label">Member</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">EXPENSE TRACKER</p>
                    <h3>Recent bills</h3>
                  </div>
                  <span className="count">{bills.length} bills</span>
                </div>

                {bills.length === 0 ? (
                  <div className="empty-state large-empty">
                    <span className="empty-icon">₹</span>
                    <strong>No bills added yet</strong>
                    <p>Create your first bill to see how expenses are split.</p>
                  </div>
                ) : (
                  <div className="bill-list">
                    {bills.map((bill) => (
                      <article className="bill-card" key={bill.id}>
                        <div className="bill-heading">
                          <div className="bill-icon">₹</div>
                          <div className="bill-title">
                            <strong>{bill.title}</strong>
                            <span>{bill.shares.length} member shares</span>
                          </div>
                          <strong className="bill-total">
                            {formatMoney(bill.totalCents)}
                          </strong>
                        </div>

                        <div className="share-list">
                          {bill.shares.map((share) => {
                            const member = members.find(
                              (item) => item.id === share.memberId,
                            )
                            const isPaying = payingShare === share.id

                            return (
                              <div className="share-row" key={share.id}>
                                <div className="share-person">
                                  <span className="mini-avatar">
                                    {member?.name.charAt(0).toUpperCase() || '?'}
                                  </span>
                                  <span>{member?.name || 'Member'}</span>
                                </div>
                                <strong>{formatMoney(share.amountCents)}</strong>
                                {share.paidAt ? (
                                  <span className="paid-tag">✓ Paid</span>
                                ) : (
                                  <button
                                    className="pay-button"
                                    disabled={payingShare !== null}
                                    onClick={() => payShare(bill.id, share.id)}
                                  >
                                    {isPaying ? 'Paying...' : 'Mark paid'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="side-column">
              <section className="panel">
                <p className="eyebrow">NEW EXPENSE</p>
                <h3>Create a bill</h3>
                <p className="muted small-text">
                  The total will be split equally among all group members.
                </p>

                <form onSubmit={createBill} className="form-stack">
                  <label htmlFor="billTitle">Bill title</label>
                  <input
                    id="billTitle"
                    value={billTitle}
                    onChange={(event) => setBillTitle(event.target.value)}
                    placeholder="e.g. Electricity bill"
                    required
                    maxLength={150}
                  />

                  <label htmlFor="billAmount">Total amount (in paise)</label>
                  <input
                    id="billAmount"
                    type="number"
                    min="1"
                    step="1"
                    value={billAmount}
                    onChange={(event) => setBillAmount(event.target.value)}
                    placeholder="e.g. 150000 for ₹1,500"
                    required
                  />
                  <p className="input-hint">
                    ₹1 = 100 paise. Enter ₹1,500 as 150000.
                  </p>

                  <button
                    className="primary-button full-button"
                    disabled={loading || members.length === 0}
                  >
                    {loading ? 'Creating...' : 'Create and split bill'}
                    <span>→</span>
                  </button>
                </form>

                {members.length === 0 && (
                  <p className="form-warning">
                    Add at least one member before creating a bill.
                  </p>
                )}
              </section>

              <section className="panel balance-panel">
                <p className="eyebrow">SETTLEMENT OVERVIEW</p>
                <h3>Outstanding balances</h3>
                {balances.length === 0 ? (
                  <p className="empty-state">Balances will appear here.</p>
                ) : (
                  <div className="balance-list">
                    {balances.map((balance) => (
                      <div className="balance-row" key={balance.memberId}>
                        <span>{balance.name}</span>
                        <strong
                          className={
                            balance.outstandingCents > 0
                              ? 'balance-due'
                              : 'balance-clear'
                          }
                        >
                          {formatMoney(balance.outstandingCents)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                <p className="input-hint">
                  Outstanding amounts include unpaid shares only.
                </p>
              </section>
            </aside>
          </section>
        </>
      )}

      <footer className="footer">
        <span>SplitMate</span>
        <span>Fair splits. Happier homes.</span>
      </footer>
    </main>
  )
}