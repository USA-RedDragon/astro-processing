<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  markMention,
  type ClaimRecord,
  type ClaimSource,
  type Mention,
  type MentionMark,
  type StarClaims,
} from '../api/claims'
import {
  againstRecord,
  checkResult,
  checkRows,
  dayTime,
  mentionHead,
  mentionPill,
  markText,
  openNew,
  sortedMentions,
} from '../claims'

const props = defineProps<{
  star: StarClaims
  sources: ClaimSource[]
  record: ClaimRecord | null
}>()
const emit = defineEmits<{ marked: [mention: Mention] }>()

const fresh = computed(() => openNew(props.star))
const open = ref(fresh.value > 0)
const mentions = computed(() => sortedMentions(props.star.mentions))
const rows = computed(() => checkRows(props.sources, props.star))
const record = computed(() => props.star.record ?? props.record)

const summary = computed(() => {
  const n = props.star.mentions.length
  if (fresh.value) return `${fresh.value} new since your record`
  if (!props.star.last_checked) return 'not checked yet'
  if (!n) return 'nobody else lists it'
  return n === 1 ? '1 mention, nothing new' : `${n} mentions, nothing new`
})

const busy = reactive<Record<number, boolean>>({})
const error = reactive<Record<number, string>>({})

async function mark(m: Mention, next: Exclude<MentionMark, 'own'>) {
  busy[m.id] = true
  error[m.id] = ''
  try {
    emit('marked', await markMention(m.id, next))
  } catch (e) {
    error[m.id] = e instanceof Error ? e.message : String(e)
  } finally {
    busy[m.id] = false
  }
}
</script>

<template>
  <section class="claims" :aria-label="'Who else lists find #' + star.source_id">
    <div class="head">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open"
        :aria-controls="'claims-' + star.source_id"
        @click="open = !open"
      >
        <span class="caret" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
        <h3>Who else lists it</h3>
        <span class="badge" :class="fresh ? 'bad' : ''">{{ summary }}</span>
      </button>
      <span v-if="star.last_checked" class="xsmall dim"
        >last checked {{ dayTime(star.last_checked) }}</span
      >
    </div>
    <div v-if="open" :id="'claims-' + star.source_id" class="body">
      <div
        v-for="m in mentions"
        :key="m.id"
        class="hit"
        :class="{ old: m.status === 'known' || m.mark !== '' }"
        :data-mention="m.id"
      >
        <div class="meta">
          <span class="badge" :class="mentionPill(m).tone">{{ mentionPill(m).text }}</span>
          <span class="small"
            ><b>{{ m.label }}</b
            ><template v-if="mentionHead(m)">, {{ mentionHead(m) }}</template></span
          >
        </div>
        <div v-if="m.detail" class="small" :class="{ dim: m.status === 'known' }">
          {{ m.detail }}
        </div>
        <div v-if="againstRecord(m, record)" class="small">{{ againstRecord(m, record) }}</div>
        <div v-if="markText(m)" class="xsmall dim">{{ markText(m) }}</div>
        <div class="btns">
          <a v-if="m.url" class="btn sm" :href="m.url" target="_blank" rel="noopener noreferrer"
            >Open the {{ m.label }} entry</a
          >
          <template v-if="m.mark !== 'own'">
            <button
              v-if="m.mark !== 'seen'"
              type="button"
              class="btn sm"
              :disabled="busy[m.id]"
              @click="mark(m, 'seen')"
            >
              Mark as seen
            </button>
            <button
              v-if="m.mark !== 'citing'"
              type="button"
              class="btn sm"
              :disabled="busy[m.id]"
              @click="mark(m, 'citing')"
            >
              Mark as citing my work
            </button>
            <button
              v-if="m.mark !== ''"
              type="button"
              class="btn sm ghost"
              :disabled="busy[m.id]"
              @click="mark(m, '')"
            >
              Clear the mark
            </button>
          </template>
        </div>
        <p v-if="error[m.id]" class="small bad" role="alert">
          That did not save: {{ error[m.id] }}
        </p>
      </div>
      <p v-if="!mentions.length" class="small dim line">
        {{
          star.last_checked
            ? 'No other listing or paper names this star.'
            : 'The weekly check has not looked at this star yet.'
        }}
      </p>
      <div class="tbl">
        <table>
          <thead>
            <tr>
              <th scope="col">Where</th>
              <th scope="col">Looks for</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.source.where">
              <td>{{ r.source.label }}</td>
              <td>{{ r.source.looks_for }}</td>
              <td>
                <span
                  v-if="checkResult(r.check).tone"
                  class="badge"
                  :class="checkResult(r.check).tone"
                  :title="r.check?.state === 'failed' ? r.check.note : undefined"
                  >{{ checkResult(r.check).text }}</span
                >
                <span v-else class="dim">{{ checkResult(r.check).text }}</span>
                <span v-if="r.check?.state === 'failed' && r.check.note" class="block xsmall dim">{{
                  r.check.note
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.claims {
  grid-column: 1 / -1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 0;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
  justify-content: space-between;
}
.toggle {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  min-width: 0;
}
.toggle:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: 4px;
}
.toggle h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}
.caret {
  width: 1em;
  color: var(--muted-foreground);
}
.badge {
  white-space: normal;
}
.body {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.hit {
  border-left: 3px solid var(--bad);
  padding: 6px 0 6px 12px;
  display: grid;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.hit.old {
  border-left-color: var(--ring);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}
.btns:empty {
  display: none;
}
.hit p.bad,
.line {
  margin: 0;
}
.tbl {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
th,
td {
  text-align: left;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  vertical-align: top;
}
th {
  font-weight: 600;
  color: var(--muted-foreground);
  font-size: 12px;
  border-top: 0;
}
</style>
