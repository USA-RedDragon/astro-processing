<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import {
  getDiscoveryCandidate,
  getDiscoveryReport,
  measureDiscoverySpot,
  reportBundleUrl,
  sendFollowupToTns,
  sendToTns,
  setTnsName,
  type DiscoveryDetail,
  type DiscoveryReport,
  type FollowupPoint,
  type TnsSendReply,
} from '../api/discoveries'
import { ApiError } from '../api/client'
import {
  CHECK_MARKS,
  REPORT_TABS,
  classLabel,
  nightLabel,
  pillOf,
  reportTab,
  type ReportTab,
} from '../discoveries'
import { clock, shortDate, toDate } from '../format'
import { showToast } from '../shell'
import { latestOnly } from '../latest'

const POLL_MS = 10000

const route = useRoute()
const id = computed(() => Number(route.params.id))

const report = ref<DiscoveryReport | null>(null)
const detail = ref<DiscoveryDetail | null>(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)
const refreshError = ref('')
const tab = ref<ReportTab>('tns')
const req = latestOnly()

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const nameDraft = ref('')
const nameBusy = ref(false)
const nameError = ref('')

function applyReport(r: DiscoveryReport) {
  const saved = report.value?.tns.name ?? ''
  if (!report.value || nameDraft.value === saved) nameDraft.value = r.tns.name ?? ''
  report.value = r
}

async function load() {
  const current = req.next()
  stopPoll()
  loading.value = true
  error.value = ''
  notFound.value = false
  refreshError.value = ''
  report.value = null
  detail.value = null
  nameDraft.value = ''
  confirming.value = false
  sendReply.value = null
  sendError.value = ''
  const want = id.value
  if (!Number.isInteger(want) || want <= 0) {
    notFound.value = true
    loading.value = false
    return
  }
  let got: DiscoveryReport | null = null
  try {
    const [r, d] = await Promise.all([getDiscoveryReport(want), getDiscoveryCandidate(want)])
    if (!current()) return
    detail.value = d
    applyReport(r)
    got = r
    tab.value = reportTab(r)
  } catch (e) {
    if (!current()) return
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else error.value = message(e)
  } finally {
    if (current()) loading.value = false
  }
  if (current() && got?.spot.state === 'none') measure(false)
}

async function refresh() {
  const want = id.value
  try {
    const r = await getDiscoveryReport(want)
    if (want !== id.value) return
    applyReport(r)
    refreshError.value = ''
  } catch (e) {
    refreshError.value = message(e)
  }
}

const spotBusy = ref(false)
const spotError = ref('')

async function measure(again: boolean) {
  const want = id.value
  spotBusy.value = true
  spotError.value = ''
  try {
    const s = await measureDiscoverySpot(want, again)
    if (want !== id.value || !report.value) return
    report.value = { ...report.value, spot: s }
  } catch (e) {
    spotError.value = message(e)
  } finally {
    spotBusy.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}
const measuring = computed(() => {
  const s = report.value?.spot.state
  return s === 'queued' || s === 'measuring'
})
watch(measuring, (on) => {
  if (on && !pollTimer) pollTimer = setInterval(refresh, POLL_MS)
  if (!on) stopPoll()
})
onUnmounted(() => {
  stopPoll()
  req.cancel()
  if (copyTimer) clearTimeout(copyTimer)
})

const backLink = computed(() => {
  const source = detail.value?.source_id
  if (source) return `/discoveries?source=${source}`
  return `/discoveries?candidate=${id.value}`
})

const subline = computed(() => {
  const r = report.value
  if (!r) return ''
  return `${r.object} · night of ${nightLabel(r.night)} · candidate at ${r.ra} ${r.dec}`
})

function when(v: string | undefined): string {
  if (!v) return ''
  return toDate(v) ? `${shortDate(v)} ${clock(v)}` : v
}

const copied = ref('')
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copy(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = ''), 2000)
  } catch (e) {
    showToast({ text: 'Could not copy', sub: message(e), tone: 'bad' })
  }
}

const tabEls = ref<HTMLElement[]>([])
function onTabKey(ev: KeyboardEvent) {
  const keys = REPORT_TABS.map((t) => t.key)
  const i = keys.indexOf(tab.value)
  let next = i
  if (ev.key === 'ArrowRight') next = (i + 1) % keys.length
  else if (ev.key === 'ArrowLeft') next = (i - 1 + keys.length) % keys.length
  else if (ev.key === 'Home') next = 0
  else if (ev.key === 'End') next = keys.length - 1
  else return
  ev.preventDefault()
  tab.value = keys[next]!
  nextTick(() => tabEls.value[next]?.focus())
}

const confirming = ref(false)
const sending = ref(false)
const sendReply = ref<TnsSendReply | null>(null)
const sendError = ref('')

function askSend() {
  if (!report.value?.tns.can_send) return
  sendReply.value = null
  sendError.value = ''
  confirming.value = true
}

async function sendNow() {
  if (!confirming.value || sending.value || !report.value?.tns.can_send) return
  const want = id.value
  sending.value = true
  sendError.value = ''
  try {
    const r = await sendToTns(want)
    if (want !== id.value) return
    sendReply.value = r
    confirming.value = false
    showToast({ text: 'Sent to TNS', sub: r.name ? r.name : `Report ${r.report_id}`, tone: 'ok' })
    refresh()
  } catch (e) {
    sendError.value = message(e)
    confirming.value = false
  } finally {
    sending.value = false
  }
}

const followup = computed(() => report.value?.tns_followup)
const fConfirming = ref(false)
const fSending = ref(false)
const fReply = ref<TnsSendReply | null>(null)
const fError = ref('')

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function pointResult(p: FollowupPoint): string {
  if (p.mag !== null && p.mag !== undefined) {
    return p.mag_err !== null && p.mag_err !== undefined
      ? `${p.mag.toFixed(2)} ± ${p.mag_err.toFixed(2)}`
      : p.mag.toFixed(2)
  }
  if (p.limit !== null && p.limit !== undefined) return `fainter than ${p.limit.toFixed(2)}`
  return 'not measured'
}

function askFollowup() {
  if (!followup.value?.can_send) return
  fReply.value = null
  fError.value = ''
  fConfirming.value = true
}

async function sendFollowupNow() {
  if (!fConfirming.value || fSending.value || !followup.value?.can_send) return
  const want = id.value
  fSending.value = true
  fError.value = ''
  try {
    const r = await sendFollowupToTns(want)
    if (want !== id.value) return
    fReply.value = r
    fConfirming.value = false
    showToast({ text: 'Photometry sent to TNS', sub: `Report ${r.report_id}`, tone: 'ok' })
    refresh()
  } catch (e) {
    fError.value = message(e)
    fConfirming.value = false
  } finally {
    fSending.value = false
  }
}

async function saveName() {
  const r = report.value
  if (!r || nameBusy.value) return
  const name = nameDraft.value.trim()
  if (name === (r.tns.name ?? '')) return
  const want = id.value
  nameBusy.value = true
  nameError.value = ''
  try {
    const next = await setTnsName(want, name)
    if (want !== id.value) return
    report.value = next
    nameDraft.value = next.tns.name ?? ''
  } catch (e) {
    nameError.value = message(e)
  } finally {
    nameBusy.value = false
  }
}

const bundle = computed(() => reportBundleUrl(id.value))

watch(id, load, { immediate: true })
</script>

<template>
  <main class="page wide rep">
    <PageHead title="Report a discovery">
      <template #context>
        <RouterLink :to="backLink" class="lnk">Back to Discoveries</RouterLink>
      </template>
      <template v-if="subline">{{ subline }}</template>
    </PageHead>

    <section v-if="loading" class="card" role="status">
      <p class="empty" style="padding: 0">Loading the report.</p>
    </section>

    <section v-else-if="notFound" class="card" role="alert">
      <h2>No such candidate</h2>
      <p class="empty" style="padding: 0">
        The stacker has no candidate number {{ route.params.id }}. It may have been removed when its
        night was compared again.
      </p>
    </section>

    <section v-else-if="error" class="card" role="alert">
      <h2>The report is not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <div v-else-if="report" class="rgrid">
      <aside class="detail" aria-label="Candidate">
        <div class="meta">
          <span class="pill" :class="pillOf(report.class)">{{ classLabel(report.class) }}</span>
          <span v-if="detail" class="snr">{{ detail.snr.toFixed(1) }}σ</span>
        </div>
        <div class="big">
          <template v-if="detail?.cutouts">
            <figure>
              <img :src="detail.cutouts.night" alt="Night image cutout" />
              <figcaption>Night</figcaption>
            </figure>
            <figure>
              <img :src="detail.cutouts.ref" alt="Reference cutout" />
              <figcaption>Reference</figcaption>
            </figure>
            <figure>
              <img :src="detail.cutouts.diff" alt="Difference cutout" />
              <figcaption>Difference</figcaption>
            </figure>
          </template>
          <p v-else class="small dim">No cutouts were saved for this candidate.</p>
        </div>
        <dl v-if="report.facts.length" class="facts">
          <template v-for="f in report.facts" :key="f.key">
            <dt>{{ f.label }}</dt>
            <dd :title="f.missing ? undefined : f.source">
              <span :class="{ missing: f.missing }">{{ f.value }}</span>
              <span v-if="f.missing && f.source" class="block src">{{ f.source }}</span>
            </dd>
          </template>
        </dl>

        <h3 class="sub">Before you report</h3>
        <ul v-if="report.checks.length" class="checks">
          <li v-for="c in report.checks" :key="c.key" :class="`st-${c.state}`">
            <span class="mark" aria-hidden="true">{{ CHECK_MARKS[c.state] ?? '?' }}</span>
            <div>
              <b>{{ c.title }}</b>
              <span class="dim small">
                {{ c.detail }}
                <a v-if="c.link" :href="c.link" target="_blank" rel="noopener noreferrer">{{
                  c.link_text || 'Open'
                }}</a>
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="small dim">No checks were listed for this candidate.</p>
      </aside>

      <section class="drafts" aria-label="Report drafts">
        <div class="tabs" role="tablist" aria-label="Where to report">
          <button
            v-for="t in REPORT_TABS"
            :id="`rep-tab-${t.key}`"
            :key="t.key"
            ref="tabEls"
            type="button"
            role="tab"
            class="tab"
            :class="{ on: tab === t.key }"
            :aria-selected="tab === t.key"
            :aria-controls="`rep-panel-${t.key}`"
            :tabindex="tab === t.key ? 0 : -1"
            @click="tab = t.key"
            @keydown="onTabKey"
          >
            {{ t.label }}
          </button>
        </div>

        <div
          id="rep-panel-tns"
          class="panel"
          role="tabpanel"
          aria-labelledby="rep-tab-tns"
          :hidden="tab !== 'tns'"
        >
          <template v-if="report.tns.applies">
            <div v-if="report.known" class="tns-known" role="note">
              <p>
                <b>{{ upperFirst(report.known.text) }}</b>
                <a
                  v-if="report.known.link"
                  :href="report.known.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ext"
                  >on TNS</a
                >
              </p>
              <template v-if="report.known.early">
                <p class="good">{{ report.known.early_text }}</p>
                <ul v-if="report.known.early_basis?.length" class="small dim basis">
                  <li v-for="(b, i) in report.known.early_basis" :key="i">{{ b }}</li>
                </ul>
              </template>
            </div>
            <p v-if="!report.known" class="dim small lead">
              The fields for a TNS discovery report, filled from your data. Check them, then copy
              them into the TNS form or send them with your TNS key.
            </p>
            <div v-if="!report.known" class="fields">
              <div v-for="f in report.tns.fields" :key="f.key" class="f">
                <span class="l">{{ f.label }}</span>
                <div class="v" :class="{ missing: f.missing }">{{ f.value }}</div>
                <span class="src">{{ f.source }}</span>
              </div>
            </div>

            <div class="spread">
              <h3 class="sub">Earlier nights at this spot</h3>
              <button
                v-if="report.spot.state === 'done' || report.spot.state === 'failed'"
                type="button"
                class="btn sm"
                :disabled="spotBusy"
                @click="measure(true)"
              >
                Measure again
              </button>
            </div>
            <p v-if="measuring" class="small dim" role="status">
              Measuring earlier nights at this spot…
            </p>
            <p v-else-if="report.spot.state === 'failed'" class="small bad" role="alert">
              Measuring earlier nights failed{{
                report.spot.error ? ': ' + report.spot.error : '.'
              }}
            </p>
            <p v-if="spotError" class="small bad" role="alert">
              Could not start measuring: {{ spotError }}
            </p>
            <p v-if="refreshError" class="small bad" role="alert">
              The report did not refresh: {{ refreshError }}
            </p>
            <div v-if="report.tns.earlier.length" class="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Night</th>
                    <th>Filter</th>
                    <th class="num">Subs</th>
                    <th class="num">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(e, i) in report.tns.earlier" :key="i" :class="{ hit: e.hit }">
                    <td>{{ nightLabel(e.night) }}</td>
                    <td>{{ e.filter }}</td>
                    <td class="num">{{ e.subs }}</td>
                    <td class="num">{{ e.result }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else-if="!measuring" class="small dim">No earlier nights listed.</p>
            <p
              v-if="report.tns.earlier_note || report.spot.measured_at"
              class="small dim note-line"
            >
              {{ report.tns.earlier_note }}
              <span v-if="report.spot.measured_at" class="block">
                Measured {{ when(report.spot.measured_at) }}
              </span>
            </p>

            <template v-if="report.known">
              <h3 class="sub">Photometry for TNS</h3>
              <p v-if="!followup?.applies" class="small dim">
                None of your measurements at this spot are from before its discovery, so there is no
                photometry to send. Measure the earlier nights to check.
              </p>
              <template v-else>
                <p class="dim small lead">
                  Your measurements at this spot, sent as a report on {{ followup.name }}. TNS adds
                  them to the existing object.
                </p>
                <div v-if="followup.points.length" class="tbl">
                  <table>
                    <thead>
                      <tr>
                        <th>Night</th>
                        <th>Filter</th>
                        <th class="num">Result</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(p, i) in followup.points" :key="i" :class="{ hit: p.early }">
                        <td>{{ nightLabel(p.night) }}</td>
                        <td>{{ p.filter }}</td>
                        <td class="num">{{ pointResult(p) }}</td>
                        <td>{{ p.early ? 'Before its discovery' : 'After its discovery' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-if="followup.non_detection" class="small dim">
                  Last time not seen: {{ followup.non_detection }}
                </p>
                <div class="actions">
                  <button
                    type="button"
                    class="btn"
                    :disabled="!followup.can_send || fConfirming || fSending"
                    :title="followup.can_send ? undefined : followup.send_reason"
                    @click="askFollowup"
                  >
                    Send photometry with my TNS key
                  </button>
                  <a class="btn" :href="bundle" download>Save the cutouts and light curve</a>
                </div>
                <p v-if="!followup.can_send && followup.send_reason" class="small dim">
                  Sending is off: {{ followup.send_reason }}
                </p>
                <div v-if="fConfirming" class="confirm" role="group" aria-label="Confirm sending">
                  <p class="small">
                    This sends your photometry to TNS under your TNS key. It is public once TNS
                    takes it.
                  </p>
                  <div class="row">
                    <button
                      type="button"
                      class="btn primary"
                      :disabled="fSending"
                      @click="sendFollowupNow"
                    >
                      Send to TNS now
                    </button>
                    <button
                      type="button"
                      class="btn ghost"
                      :disabled="fSending"
                      @click="fConfirming = false"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <p v-if="fReply" class="small good" role="status">
                  TNS took the photometry: report {{ fReply.report_id }}.
                </p>
                <p v-if="fError" class="small bad" role="alert">
                  TNS did not take it: {{ fError }}
                </p>
                <p v-if="followup.sent_at" class="small dim">
                  Sent {{ when(followup.sent_at)
                  }}<template v-if="followup.sent_reply">: {{ followup.sent_reply }}</template>
                </p>
                <p class="small dim">Nothing is sent until you press Send.</p>
              </template>
            </template>
            <template v-else>
              <div class="actions">
                <button
                  type="button"
                  class="btn primary"
                  @click="copy('tns', report.tns.copy_text)"
                >
                  {{ copied === 'tns' ? 'Copied' : 'Copy for the TNS form' }}
                </button>
                <button
                  type="button"
                  class="btn"
                  :disabled="!report.tns.can_send || confirming || sending"
                  :title="report.tns.can_send ? undefined : report.tns.send_reason"
                  @click="askSend"
                >
                  Send with my TNS key
                </button>
                <a class="btn" :href="bundle" download>Save the cutouts and light curve</a>
              </div>
              <p v-if="!report.tns.can_send && report.tns.send_reason" class="small dim">
                Sending is off: {{ report.tns.send_reason }}
              </p>
              <div v-if="confirming" class="confirm" role="group" aria-label="Confirm sending">
                <p class="small">
                  This sends the report to TNS under your TNS key. It is public once TNS takes it.
                </p>
                <div class="row">
                  <button type="button" class="btn primary" :disabled="sending" @click="sendNow">
                    Send to TNS now
                  </button>
                  <button
                    type="button"
                    class="btn ghost"
                    :disabled="sending"
                    @click="confirming = false"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p v-if="sendReply" class="small good" role="status">
                TNS took the report: report {{ sendReply.report_id
                }}<template v-if="sendReply.name">, name {{ sendReply.name }}</template
                >.
              </p>
              <p v-if="sendError" class="small bad" role="alert">
                TNS did not take it: {{ sendError }}
              </p>
              <p v-if="report.tns.sent_at" class="small dim">
                Sent {{ when(report.tns.sent_at)
                }}<template v-if="report.tns.sent_reply">: {{ report.tns.sent_reply }}</template>
              </p>
              <p class="small dim">
                Nothing is sent until you press Send. After you report, paste the name TNS gives it
                (for example AT 2026xyz) here and the page links to it.
              </p>
              <div class="f2">
                <label for="rep-tns-name" class="small dim">TNS name after reporting</label>
                <div class="row">
                  <input
                    id="rep-tns-name"
                    v-model="nameDraft"
                    class="input"
                    placeholder="AT 2026…"
                    :disabled="nameBusy"
                    @keydown.enter.prevent="saveName"
                    @blur="saveName"
                  />
                  <button type="button" class="btn sm" :disabled="nameBusy" @click="saveName">
                    Save
                  </button>
                </div>
                <p v-if="report.tns.name_link && report.tns.name" class="small">
                  <a
                    :href="report.tns.name_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ext"
                    >{{ report.tns.name }}</a
                  >
                  on TNS
                </p>
                <p v-if="nameError" class="small bad" role="alert">
                  That did not save: {{ nameError }}
                </p>
              </div>
            </template>
          </template>
          <p v-else class="small dim">
            TNS takes supernovae and novae. This candidate does not look like one, so there is no
            TNS report to fill in.
          </p>
        </div>

        <div
          id="rep-panel-mpc"
          class="panel"
          role="tabpanel"
          aria-labelledby="rep-tab-mpc"
          :hidden="tab !== 'mpc'"
        >
          <template v-if="report.mpc.applies">
            <p class="dim small lead">
              The astrometry for a Minor Planet Center report, in both formats the MPC takes.
            </p>
            <div class="f code">
              <span class="l">Observatory code</span>
              <div class="v" :class="{ missing: !report.mpc.code }">
                {{ report.mpc.code || 'Not set' }}
              </div>
              <span v-if="!report.mpc.code && report.mpc.reason" class="src">{{
                report.mpc.reason
              }}</span>
            </div>
            <div class="spread">
              <h3 class="sub">ADES PSV</h3>
              <button
                v-if="report.mpc.psv"
                type="button"
                class="btn sm"
                @click="copy('psv', report.mpc.psv)"
              >
                {{ copied === 'psv' ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <pre v-if="report.mpc.psv" class="text">{{ report.mpc.psv }}</pre>
            <p v-else class="small dim">Not available.</p>
            <div class="spread">
              <h3 class="sub">ADES XML</h3>
              <button
                v-if="report.mpc.xml"
                type="button"
                class="btn sm"
                @click="copy('xml', report.mpc.xml)"
              >
                {{ copied === 'xml' ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <pre v-if="report.mpc.xml" class="text">{{ report.mpc.xml }}</pre>
            <p v-else class="small dim">Not available.</p>
          </template>
          <p v-else class="small dim">
            {{
              report.mpc.reason ||
              'The Minor Planet Center takes moving objects. This candidate does not move.'
            }}
          </p>
        </div>

        <div
          id="rep-panel-vsx"
          class="panel"
          role="tabpanel"
          aria-labelledby="rep-tab-vsx"
          :hidden="tab !== 'vsx'"
        >
          <template v-if="report.vsx.applies">
            <p class="dim small lead">
              The details for a new entry in the AAVSO variable star index.
            </p>
            <dl class="facts">
              <dt>Position</dt>
              <dd class="mono">{{ report.vsx.position }}</dd>
              <dt>Type (your guess)</dt>
              <dd>{{ report.vsx.type_guess }}</dd>
              <dt>Range</dt>
              <dd>{{ report.vsx.range }}</dd>
            </dl>
            <h3 class="sub">Light curve</h3>
            <div v-if="report.vsx.points.length" class="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Filter</th>
                    <th class="num">Magnitude</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in report.vsx.points" :key="i">
                    <td>{{ when(p.time) }}</td>
                    <td>{{ p.filter }}</td>
                    <td class="num">
                      {{ p.mag.toFixed(2)
                      }}<template v-if="p.mag_err !== undefined && p.mag_err !== null">
                        ± {{ p.mag_err.toFixed(2) }}</template
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="small dim">No measurements yet.</p>
          </template>
          <p v-else class="small dim">
            VSX takes new variable stars. This candidate does not look like one.
          </p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.rep {
  max-width: 80rem;
  --d-card: oklch(0.985 0 0);
  --known: oklch(0.55 0.13 250);
  --known-bg: oklch(0.95 0.03 250);
  --new: oklch(0.55 0.17 145);
  --new-bg: oklch(0.95 0.05 145);
  --low: oklch(0.55 0.02 285);
  --low-bg: oklch(0.95 0.003 285);
  --d-ok: oklch(0.55 0.14 150);
  --todo: oklch(0.6 0.15 70);
  --d-bad: oklch(0.55 0.2 25);
}
.dark .rep {
  --d-card: oklch(0.18 0.005 285.8);
  --known: oklch(0.75 0.12 250);
  --known-bg: oklch(0.3 0.06 250);
  --new: oklch(0.8 0.15 145);
  --new-bg: oklch(0.3 0.07 145);
  --low: oklch(0.75 0.02 285);
  --low-bg: oklch(0.28 0.01 285);
  --d-ok: oklch(0.78 0.13 150);
  --todo: oklch(0.82 0.13 80);
  --d-bad: oklch(0.72 0.17 25);
}
.dim {
  color: var(--muted-foreground);
}
.small {
  font-size: 12px;
}
.mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.block {
  display: block;
}
.bad {
  color: var(--d-bad);
}
.good {
  color: var(--d-ok);
}
p {
  margin: 0;
}
.rgrid {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .rgrid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.detail {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--d-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 99px;
  border: 0;
}
.pill.known {
  color: var(--known);
  background: var(--known-bg);
}
.pill.low {
  color: var(--low);
  background: var(--low-bg);
}
.pill.new {
  color: var(--new);
  background: var(--new-bg);
}
.snr {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.big {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.big p {
  grid-column: 1 / -1;
}
.big figure {
  margin: 0;
}
.big img {
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
  display: block;
  border-radius: 6px;
  background: var(--muted);
}
.big figcaption {
  font-size: 11px;
  color: var(--muted-foreground);
  text-align: center;
  margin-top: 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
}
dt {
  color: var(--muted-foreground);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.missing {
  color: var(--todo);
}
h3.sub {
  font-size: 14px;
  margin: 6px 0 0;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checks li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.checks li div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mark {
  width: 20px;
  height: 20px;
  border-radius: 99px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
}
.st-ok .mark {
  color: var(--d-ok);
  border: 1.5px solid var(--d-ok);
}
.st-todo .mark {
  color: var(--todo);
  border: 1.5px solid var(--todo);
}
.st-wait .mark {
  color: var(--muted-foreground);
  border: 1.5px dashed var(--muted-foreground);
}
.st-bad .mark {
  color: var(--d-bad);
  border: 1.5px solid var(--d-bad);
}
.checks a,
.ext {
  color: var(--known);
}
.checks a:hover,
.ext:hover {
  text-decoration: underline;
}
.drafts {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--d-card);
  min-width: 0;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 8px 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.tab {
  font: inherit;
  color: var(--muted-foreground);
  background: none;
  border: 0;
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
}
.tab.on {
  color: var(--foreground);
  border-bottom-color: var(--foreground);
  font-weight: 500;
}
.panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 10px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  min-width: 0;
  overflow-wrap: anywhere;
}
.f.code {
  max-width: 320px;
}
.f .l {
  font-size: 12px;
  color: var(--muted-foreground);
}
.f .v {
  font-weight: 500;
}
.src {
  font-size: 11px;
  color: var(--muted-foreground);
}
.spread h3.sub {
  margin: 0;
}
.tbl {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: 420px;
}
th,
td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
th.num,
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
th {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}
tr:last-child td {
  border-bottom: 0;
}
tr.hit td {
  font-weight: 600;
}
.note-line {
  margin-top: -6px;
}
.tns-known {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.tns-known p {
  margin: 0;
}
.basis {
  margin: 0;
  padding-left: 18px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--todo);
  border-radius: 8px;
}
.f2 {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 360px;
}
.f2 .input {
  flex: 1 1 12rem;
  min-width: 0;
}
pre.text {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre;
}
</style>
