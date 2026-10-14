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
      {
        to: '/autofocus',
        label: 'Autofocus',
        note: "Curves, tonight's runs, focus drift",
        names: ['autofocus'],
      },
    ],
  },
  {
    label: 'Plan',
    items: [
      {
        to: '/?view=list',
        label: 'Projects',
        note: 'All projects, bulk priority, open one',
        names: ['targets'],
      },
      {
        to: '/mosaics',
        label: 'Mosaics',
        note: 'Panels, seams, seasons, adoption',
        names: ['mosaics', 'mosaic'],
      },
      {
        to: '/rule-weights',
        label: 'Rule weights',
        note: 'One scoring set for every project',
        names: ['rule-weights'],
      },
      {
        to: '/scheduling',
        label: 'Scheduling',
        note: 'Settings every project uses',
        names: ['scheduling'],
      },
      { to: '/history', label: 'History', note: 'Every change, with undo', names: ['history'] },
      { to: '/add', label: 'Add target', note: 'Find, frame, mosaic, goal', names: ['add'] },
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
        to: '/sky-events',
        label: 'Events',
        note: 'Conjunctions and close passes to plan',
        names: ['sky-events'],
      },
      {
        to: '/discoveries',
        label: 'Discoveries',
        note: 'Changes, variables and asteroids found each night',
        names: ['discoveries'],
      },
      {
        to: '/collabs',
        label: 'Collabs',
        note: 'Starfront collaborations and fit',
        names: ['collabs'],
      },
    ],
  },
]
