import type { DiscoveryCandidate, DiscoveryRun, DiscoverySource } from '@/scheduler/api/discoveries'

export function candidate(over: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    id: 1,
    run_id: 7,
    object: 'IC 3393 Panel 1',
    night: '2025-02-28',
    group: 'broadband',
    kind: 'change',
    class: 'known_variable',
    x: 100,
    y: 200,
    ra: 189.30894,
    dec: 14.44218,
    sign: 1,
    snr: 50.5,
    delta_mag: -0.158,
    night_mag: 15.75,
    ref_mag: 15.91,
    gaia_g: 15.91,
    present_in: 14,
    subs_tested: 16,
    matches: [{ catalog: 'VSX', name: 'V0501 Com', type: 'EW', sep_arcsec: 0.8 }],
    vetting: '',
    vet_note: '',
    vetted_at: null,
    cutouts: null,
    ...over,
  }
}

export function run(over: Partial<DiscoveryRun> = {}): DiscoveryRun {
  return {
    id: 7,
    object: 'IC 3393 Panel 1',
    night: '2025-02-28',
    group: 'broadband',
    filters: ['Luminance'],
    state: 'done',
    night_subs: 16,
    ref_subs: 48,
    ref_nights: 6,
    depth: 20.2,
    sub_depth: 18.9,
    zero_point: 24.1,
    astrometry_rms_arcsec: 0.3,
    astrometry_stars: 400,
    hfr_night_px: 2.1,
    hfr_ref_px: 2.0,
    pixel_scale: 1.2,
    field_ra: 189.2,
    field_dec: 14.2,
    candidates: 2,
    new: 0,
    tracks: 1,
    known_tracks: 1,
    known_bodies_in_field: 3,
    checked: ['VSX', 'SkyBoT', 'ALeRCE', 'Fink', 'galaxies'],
    failed: [],
    classes: { known_variable: 1 },
    vetted: 0,
    mid_time: '2025-03-01T06:00:00Z',
    finished_at: '2025-03-01T13:00:00Z',
    seconds: 120,
    ...over,
  }
}

const cygnusCand = (
  id: number,
  night: string,
  group: string,
  dmag: number,
  over: Partial<DiscoveryCandidate> = {},
) =>
  candidate({
    id,
    object: 'Cygnis Loop Panel 2',
    night,
    group,
    class: 'new_variable_candidate',
    ra: 314.32090473,
    dec: 28.71852825,
    sign: -1,
    delta_mag: dmag,
    night_mag: 18.4,
    ref_mag: 18.0,
    gaia_g: 18.055428,
    matches: [],
    source_id: 1,
    ...over,
  })

/** cygnus is the Cygnus Loop Panel 2 source the backfill found on Oct 5, 6 and 7. */
export function cygnus(over: Partial<DiscoverySource> = {}): DiscoverySource {
  const best = cygnusCand(14082, '2026-10-07', 'S-II', 0.407, { present_in: 7, subs_tested: 7 })
  return {
    id: 1,
    object: 'Cygnis Loop Panel 2',
    kind: 'change',
    class: 'new_variable_candidate',
    ra: best.ra,
    dec: best.dec,
    first_seen: '2026-10-05',
    last_seen: '2026-10-07',
    nights_seen: 3,
    nights_compared: 4,
    needs_look: true,
    vetting: '',
    vet_note: '',
    vetted_at: null,
    best,
    nights: [
      { night: '2026-10-07', candidates: [best] },
      {
        night: '2026-10-06',
        candidates: [
          cygnusCand(14520, '2026-10-06', 'S-II', 0.673, { present_in: 8, subs_tested: 8 }),
          cygnusCand(14443, '2026-10-06', 'H-a', 0.329, { class: 'low_confidence' }),
        ],
      },
      {
        night: '2026-10-05',
        candidates: [
          cygnusCand(15111, '2026-10-05', 'S-II', 0.58, { present_in: 6, subs_tested: 7 }),
          cygnusCand(15045, '2026-10-05', 'H-a', 0.573, { present_in: 7, subs_tested: 8 }),
        ],
      },
    ],
    checked: ['ALeRCE', 'SkyBoT', 'VSX'],
    failed: ['Fink', 'SIMBAD'],
    ...over,
  }
}

/** nova is the possible nova in M 31 from Oct 11. */
export function nova(over: Partial<DiscoverySource> = {}): DiscoverySource {
  const best = candidate({
    id: 18554,
    object: 'Andromeda',
    night: '2026-10-11',
    class: 'nova_candidate',
    ra: 10.55797,
    dec: 41.27669,
    delta_mag: -0.351,
    night_mag: null,
    ref_mag: null,
    gaia_g: null,
    matches: [
      {
        catalog: 'galaxy',
        name: 'Andromeda Galaxy',
        type: 'Local Group galaxy',
        sep_arcsec: 344.2,
      },
    ],
    source_id: 2,
  })
  return {
    id: 2,
    object: 'Andromeda',
    kind: 'change',
    class: 'nova_candidate',
    ra: best.ra,
    dec: best.dec,
    first_seen: '2026-10-11',
    last_seen: '2026-10-11',
    nights_seen: 1,
    nights_compared: 1,
    needs_look: true,
    vetting: '',
    vet_note: '',
    vetted_at: null,
    best,
    nights: [{ night: '2026-10-11', candidates: [best] }],
    checked: ['VSX', 'SkyBoT', 'ALeRCE'],
    failed: [],
    ...over,
  }
}
