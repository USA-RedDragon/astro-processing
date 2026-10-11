import { reactive } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.afterEach((to) => {
  const t = to.meta.title as string | undefined
  document.title = t ? `${t} · Astro Processing` : 'Astro Processing'
})

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

export const pageLoad = reactive({ failed: '' })

function reloadKey(path: string): string {
  return 'chunk-reload:' + path
}

router.onError((err, to) => {
  if (!CHUNK_ERROR.test(String((err as Error)?.message ?? err))) return
  try {
    if (!sessionStorage.getItem(reloadKey(to.fullPath))) {
      sessionStorage.setItem(reloadKey(to.fullPath), '1')
      window.location.assign(to.fullPath)
      return
    }
  } catch {
    pageLoad.failed = to.fullPath
    return
  }
  pageLoad.failed = to.fullPath
})

router.afterEach((to) => {
  pageLoad.failed = ''
  try {
    sessionStorage.removeItem(reloadKey(to.fullPath))
  } catch {
    return
  }
})

export default router
