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
      {
        to: '/now',
        label: 'Now',
        note: 'Current target, latest sub, skip and pause',
        names: ['now'],
      },
      {
        to: '/tonight',
        label: 'Tonight',
        note: 'Timeline, why each pick, what-if',
        names: ['tonight'],
      },
    ],
  },
  {
    label: 'Plan',
    items: [
      {
        to: '/mosaics',
        label: 'Mosaics',
        note: 'Panels, seams, seasons, adoption',
        names: ['mosaics', 'mosaic'],
      },
    ],
  },
  {
    label: 'Discover',
    items: [
      {
        to: '/catalogues',
        label: 'Catalogues',
        note: 'Completion and name matches',
        names: ['catalogues'],
      },
      { to: '/finder', label: 'Finder', note: 'Objects that suit your frame', names: ['finder'] },
      {
        to: '/collabs',
        label: 'Collabs',
        note: 'Starfront collaborations and fit',
        names: ['collabs'],
      },
    ],
  },
]
