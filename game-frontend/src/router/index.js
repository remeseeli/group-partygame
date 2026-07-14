import { createRouter, createWebHistory } from 'vue-router'
import MobileJoinView from '../views/MobileJoinView.vue'
import TVView from '../views/TVView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'join',
      component: MobileJoinView
    },
    {
      path: '/tv',
      name: 'tv',
      component: TVView
    }
  ],
})

export default router
