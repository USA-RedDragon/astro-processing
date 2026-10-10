export interface NavItem {
  to: string
  label: string
  note: string
  names: string[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { to: '/now', label: 'Now', note: 'Current target, latest sub, skip and pause', names: ['now'] },
      { to: '/tonight', label: 'Tonight', note: 'Timeline, why each pick, what-if', names: ['tonight'] },
    ],
  },
]
