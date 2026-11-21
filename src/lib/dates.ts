const pad = (n: number) => String(n).padStart(2, '0')

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => iso(new Date())
export const parse = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
export const monthKey = (s: string) => s.slice(0, 7)
export const monthLabel = (key: string, long = false) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
  })
export const lastMonths = (n: number) => {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return iso(d).slice(0, 7)
  })
}

/** "Today", "Tomorrow", "Yesterday", otherwise "21 Nov" (with year when it is not this year). */
export const dayLabel = (s: string | null) => {
  if (!s) return 'No date'
  const diff = daysBetween(today(), s)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const d = parse(s)
  return d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}
export const longToday = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** For sentences: "due today", "due on 25 Nov". */
export const dueText = (s: string) => {
  const label = dayLabel(s)
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? `due ${label.toLowerCase()}` : `due on ${label}`
}

export const monthStart = (key: string) => `${key}-01`
export const monthEnd = (key: string) => iso(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0))
export const addMonths = (key: string, n: number) =>
  iso(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + n, 1)).slice(0, 7)
/** Every 'YYYY-MM' from the month of `from` to the month of `to`, oldest first. */
export const monthsBetween = (from: string, to: string) => {
  const out: string[] = []
  for (let m = monthKey(from); m <= monthKey(to) && out.length < 120; m = addMonths(m, 1)) out.push(m)
  return out
}
export const fullDate = (s: string) =>
  parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
export const monthYear = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
