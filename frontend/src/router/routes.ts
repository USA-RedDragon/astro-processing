import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Main',
    component: () => import('../views/MainPage.vue'),
  },
  {
    path: '/project/:id',
    name: 'ProjectDetails',
    component: () => import('../views/ProjectDetailsPage.vue'),
  },
  {
    path: '/target/:id',
    name: 'TargetDetails',
    component: () => import('../views/TargetDetailsPage.vue'),
  },
  {
    path: '/object/:name',
    name: 'Object',
    component: () => import('../views/ObjectPage.vue'),
  },
  {
    path: '/calibration',
    name: 'Calibration',
    component: () => import('../views/CalibrationPage.vue'),
  },
  {
    path: '/now',
    name: 'now',
    component: () => import('../scheduler/pages/NowPage.vue'),
    meta: { title: 'Now' },
  },
  {
    path: '/autofocus',
    name: 'autofocus',
    component: () => import('../scheduler/pages/AutofocusPage.vue'),
    meta: { title: 'Autofocus' },
  },
  {
    path: '/tonight',
    name: 'tonight',
    component: () => import('../scheduler/pages/TonightPage.vue'),
    meta: { title: 'Tonight' },
  },
  {
    path: '/catalogues',
    name: 'catalogues',
    component: () => import('../scheduler/pages/CataloguesPage.vue'),
    meta: { title: 'Catalogues' },
  },
  {
    path: '/finder',
    name: 'finder',
    component: () => import('../scheduler/pages/FinderPage.vue'),
    meta: { title: 'Finder' },
  },
  {
    path: '/sky-events',
    name: 'sky-events',
    component: () => import('../scheduler/pages/SkyEventsPage.vue'),
    meta: { title: 'Sky events' },
  },
  {
    path: '/collabs',
    name: 'collabs',
    component: () => import('../scheduler/pages/CollabsPage.vue'),
    meta: { title: 'Collabs' },
  },
  {
    path: '/discoveries',
    name: 'discoveries',
    component: () => import('../scheduler/pages/DiscoveriesPage.vue'),
    meta: { title: 'Discoveries' },
  },
  {
    path: '/discoveries/report/:id',
    name: 'discovery-report',
    component: () => import('../scheduler/pages/DiscoveryReportPage.vue'),
    meta: { title: 'Report a discovery' },
  },
  {
    path: '/mosaics',
    name: 'mosaics',
    component: () => import('../scheduler/pages/MosaicsPage.vue'),
    meta: { title: 'Mosaics' },
  },
  {
    path: '/mosaics/:projectId',
    name: 'mosaic',
    component: () => import('../scheduler/pages/MosaicsPage.vue'),
    props: true,
    meta: { title: 'Mosaic' },
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('../scheduler/pages/AddTargetPage.vue'),
    meta: { title: 'Add target' },
  },
  {
    path: '/rule-weights',
    name: 'rule-weights',
    component: () => import('../scheduler/pages/RuleWeightsPage.vue'),
    meta: { title: 'Rule weights' },
  },
  {
    path: '/scheduling',
    name: 'scheduling',
    component: () => import('../scheduler/pages/SchedulingPage.vue'),
    meta: { title: 'Scheduling' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../scheduler/pages/HistoryPage.vue'),
    meta: { title: 'History' },
  },
  {
    path: '/targets',
    name: 'targets',
    redirect: (to) => ({ path: '/', query: { ...to.query, view: 'list' } }),
  },
  {
    path: '/targets/:projectId',
    name: 'target',
    redirect: (to) => {
      const { target, ...rest } = to.query
      if (target) return { path: `/target/${target}`, query: rest }
      return { path: `/project/${to.params.projectId}`, query: rest }
    },
  },
  {
    path: '/start',
    name: 'start',
    redirect: '/',
  },
]

export default routes
