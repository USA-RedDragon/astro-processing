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
    path: '/collabs',
    name: 'collabs',
    component: () => import('../scheduler/pages/CollabsPage.vue'),
    meta: { title: 'Collabs' },
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
  ...[
    ['/add', 'add'],
    ['/mosaics', 'mosaics'],
    ['/mosaics/:projectId', 'mosaic'],
    ['/templates', 'templates'],
    ['/history', 'history'],
  ].map(([path, name]) => ({
    path: path!,
    name: name!,
    component: () => import('../views/MainPage.vue'),
    beforeEnter: (to: { fullPath: string }) => {
      window.location.href = `https://astro-stacker.jackal-stargazer.ts.net${to.fullPath}`
      return false
    },
  })),
  {
    path: '/start',
    name: 'start',
    redirect: '/',
  },
]

export default routes
