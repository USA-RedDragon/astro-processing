export default [
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
  }
]
