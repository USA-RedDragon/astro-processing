<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RecentCalibration } from '../api/scheduler'
import type { DarkBacklog } from '../api/darks'
import { missingView, recentView } from '../nowcalib'

const props = defineProps<{
  backlog: DarkBacklog | null
  backlogNote: string
  recent: RecentCalibration | null
  recentNote: string
}>()

const missing = computed(() => missingView(props.backlog))
const recent = computed(() => recentView(props.recent))
</script>

<template>
  <section class="card" aria-labelledby="missing-h" style="gap: 0.75rem">
    <div class="spread">
      <h2 id="missing-h">Dark sets still missing</h2>
      <RouterLink :to="{ name: 'Calibration' }" class="lnk small muted"
        >Calibration page</RouterLink
      >
    </div>
    <template v-if="missing">
      <p class="small muted num" style="margin: 0">{{ missing.summary }}</p>
      <div v-if="missing.rows.length" class="scroll-x">
        <table class="tbl num">
          <thead>
            <tr>
              <th>Set</th>
              <th class="r">Have</th>
              <th class="r">Lights waiting</th>
              <th>Latest night</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in missing.rows" :key="r.key">
              <td>{{ r.set }}</td>
              <td class="r">{{ r.have }}</td>
              <td class="r" :class="{ bad: r.bad }">{{ r.waiting }}</td>
              <td>{{ r.latest }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="missing.more" class="xsmall muted" style="margin: 0">
        {{ missing.more }} more on the Calibration page.
      </p>
      <p v-if="missing.foot" class="xsmall muted" style="margin: 0">{{ missing.foot }}</p>
    </template>
    <p v-else class="empty" style="padding: 0">{{ backlogNote }}</p>
  </section>

  <section class="card" aria-labelledby="recent-h" style="gap: 0.75rem">
    <div class="spread">
      <h2 id="recent-h">Recent calibration</h2>
      <span class="xsmall muted">last 24 hours</span>
    </div>
    <template v-if="recent">
      <div v-if="recent.rows.length" class="scroll-x">
        <table class="tbl num">
          <thead>
            <tr>
              <th>Ended</th>
              <th>Kind</th>
              <th>Set</th>
              <th class="r">Frames</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in recent.rows" :key="i">
              <td>{{ r.ended }}</td>
              <td>{{ r.kind }}</td>
              <td>{{ r.set }}</td>
              <td class="r" :class="{ bad: r.leak }">{{ r.frames }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty" style="padding: 0">No calibration frames in the last 24 hours.</p>
      <p v-if="recent.foot" class="xsmall muted" style="margin: 0">{{ recent.foot }}</p>
    </template>
    <p v-else class="empty" style="padding: 0">{{ recentNote }}</p>
  </section>
</template>

<style scoped>
.tbl {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.8125rem;
}
.tbl th {
  font-weight: 500;
  color: var(--muted-foreground);
  text-align: left;
  font-size: 0.75rem;
  padding: 0 0.75rem 0.375rem 0;
  white-space: nowrap;
}
.tbl td {
  white-space: nowrap;
  padding: 0.4375rem 0.75rem 0.4375rem 0;
  border-top: 1px solid var(--border);
  vertical-align: top;
}
.tbl .r {
  text-align: right;
}
.bad {
  color: var(--bad);
}
</style>
