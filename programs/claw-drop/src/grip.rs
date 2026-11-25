//! Grip math. This decides whether a player wins, so it is pure, integer-only and tested hard.
//!
//! No floating point, no square root, no dependencies: it compiles and tests on its own
//! (`rustc --edition 2021 --test grip.rs`) and is `no_std`-compatible.
//!
//! ```text
//! d2       = dx² + dz²                 // drop point to slot centre
//! r2       = radius²
//! grip_bps = min + (base − min) × (r2 − d2) / r2      clamped to [min, base]
//! won      = (randomness mod 10000) < grip_bps
//! ```
//!
//! Conventions fixed here (the Fairness page and any off-chain verifier must match):
//! * The radius is **inclusive**: a drop with `d2 == r2` is inside and gets exactly `min` grip.
//! * A slot with `radius == 0` is disabled: it can never be targeted, even at its exact centre.
//! * `randomness mod 10000` treats the 32 bytes as one big-endian 256-bit integer.
//! * Overlapping radii: the smallest `d2 / r2` wins; an exact tie goes to the lower slot index.
//! * Floor division everywhere, so rounding always favours the house by < 1 bps.

/// Floor coordinates are `0..=COORD_MAX` on both axes.
pub const COORD_MAX: u16 = 1000;
/// Basis-point denominator: 10_000 bps = 100 %.
pub const BPS_DENOM: u32 = 10_000;

/// The geometry of one slot, all the targeting maths needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Geo {
    pub x: u16,
    pub z: u16,
    pub radius: u16,
}

/// Squared distance between two points. Exact for the whole `u16` range:
/// `2 × 65535² = 8_589_672_450 < 2^33`, so it needs `u64`; for in-range coordinates
/// (`<= 1000`) it is at most `2_000_000`.
#[inline]
pub fn dist2(ax: u16, az: u16, bx: u16, bz: u16) -> u64 {
    let dx = ax.abs_diff(bx) as u64;
    let dz = az.abs_diff(bz) as u64;
    dx * dx + dz * dz
}

/// `radius²`. At most `65535² = 4_294_836_225`.
#[inline]
pub fn radius2(radius: u16) -> u64 {
    (radius as u64) * (radius as u64)
}

/// Is the point inside the slot? Inclusive of the boundary; a zero radius contains nothing.
#[inline]
pub fn contains(geo: &Geo, x: u16, z: u16) -> bool {
    geo.radius != 0 && dist2(x, z, geo.x, geo.z) <= radius2(geo.radius)
}

/// Which slot does a drop at `(x, z)` target? `None` means a miss with no roll.
///
/// Among slots that contain the point, the smallest `d2 / r2` wins. Fractions are compared by
/// cross-multiplication in `u128`, which is exact and cannot overflow
/// (`(2^32)² × 2` is far below `2^128`). An exact tie goes to the lower index.
///
/// Returns `(index, d2, r2)` so the caller can compute grip without recomputing.
pub fn find_target(slots: &[Geo], x: u16, z: u16) -> Option<(usize, u64, u64)> {
    let mut best: Option<(usize, u64, u64)> = None;
    for (i, g) in slots.iter().enumerate() {
        if !contains(g, x, z) {
            continue;
        }
        let d2 = dist2(x, z, g.x, g.z);
        let r2 = radius2(g.radius);
        match best {
            None => best = Some((i, d2, r2)),
            Some((_, bd2, br2)) => {
                // d2/r2 < bd2/br2  <=>  d2 * br2 < bd2 * r2   (both r2 > 0)
                if (d2 as u128) * (br2 as u128) < (bd2 as u128) * (r2 as u128) {
                    best = Some((i, d2, r2));
                }
            }
        }
    }
    best
}

/// Which slot does a drop at `(x, z)` target when every slot owns several circles?
///
/// The rule is `find_target`'s, applied across every live circle of every slot: the circle with
/// the smallest `d2 / r2` wins, an exact tie goes to the lower slot, then to the lower circle.
/// A circle with radius 0 is unused and never matches. Returns `(slot, d2, r2)` of the winning
/// circle, so grip falls off from the centre of the circle that was actually hit.
pub fn best_circle<const N: usize>(slots: &[[Geo; N]], x: u16, z: u16) -> Option<(usize, u64, u64)> {
    let mut best: Option<(usize, u64, u64)> = None;
    for (i, circles) in slots.iter().enumerate() {
        for g in circles.iter() {
            if !contains(g, x, z) {
                continue;
            }
            let d2 = dist2(x, z, g.x, g.z);
            let r2 = radius2(g.radius);
            match best {
                None => best = Some((i, d2, r2)),
                Some((_, bd2, br2)) => {
                    if (d2 as u128) * (br2 as u128) < (bd2 as u128) * (r2 as u128) {
                        best = Some((i, d2, r2));
                    }
                }
            }
        }
    }
    best
}

/// Grip chance in basis points for a drop `d2` away from a slot of squared radius `r2`.
///
/// `base_bps` is the grip at dead centre, `min_bps` the grip on the boundary. The result is
/// always within `[min_bps, base_bps]`. `r2 == 0` (disabled slot) returns 0: it cannot win.
/// If a misconfigured slot has `base_bps < min_bps` the result is `base_bps`, never higher
/// than the configured ceiling. `set_slot` must also reject `base_bps > 10_000`.
pub fn grip_bps(d2: u64, r2: u64, base_bps: u16, min_bps: u16) -> u16 {
    if r2 == 0 {
        return 0;
    }
    if base_bps <= min_bps {
        return base_bps;
    }
    if d2 >= r2 {
        return min_bps;
    }
    let span = (base_bps - min_bps) as u64; // <= 65535
    // span <= 2^16 and (r2 - d2) < 2^32, so the product is < 2^48: no overflow.
    let extra = span * (r2 - d2) / r2; // floor, in [0, span]
    min_bps + extra as u16
}

/// `randomness mod 10000`, treating the 32 bytes as a single big-endian 256-bit integer.
/// Computed byte by byte so no wide integer is needed: `acc < 10_000`, so `acc * 256 + b`
/// stays below `2_560_256`, well inside `u32`.
pub fn roll_bps(randomness: &[u8; 32]) -> u16 {
    let mut acc: u32 = 0;
    for &b in randomness.iter() {
        acc = (acc * 256 + b as u32) % BPS_DENOM;
    }
    acc as u16
}

/// Decide the roll: `(roll_bps, won)` where `won = roll_bps < grip_bps`.
pub fn resolve(randomness: &[u8; 32], grip: u16) -> (u16, bool) {
    let roll = roll_bps(randomness);
    (roll, roll < grip)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The five slots from the handoff §3.1 (centres are placeholders; radii, base and min are real).
    const R: [u16; 5] = [120, 90, 60, 45, 35];
    const BASE: [u16; 5] = [7000, 5000, 3000, 1200, 400];
    const MIN: [u16; 5] = [2000, 1200, 600, 200, 100];

    fn one(x: u16, z: u16, r: u16) -> [Geo; 1] {
        [Geo { x, z, radius: r }]
    }

    // ---- distance / containment -------------------------------------------------------

    #[test]
    fn dist2_is_exact_at_extremes() {
        assert_eq!(dist2(0, 0, 0, 0), 0);
        assert_eq!(dist2(0, 0, 1000, 1000), 2_000_000);
        assert_eq!(dist2(1000, 1000, 0, 0), 2_000_000); // symmetric
        assert_eq!(dist2(3, 4, 0, 0), 25);
        // whole u16 range: no overflow, exact
        assert_eq!(dist2(0, 0, u16::MAX, u16::MAX), 2 * 65535u64 * 65535u64);
        assert_eq!(dist2(u16::MAX, 0, 0, u16::MAX), 2 * 65535u64 * 65535u64);
    }

    #[test]
    fn radius2_max_fits() {
        assert_eq!(radius2(0), 0);
        assert_eq!(radius2(120), 14_400);
        assert_eq!(radius2(u16::MAX), 4_294_836_225);
    }

    // ---- targeting: centre / boundary / outside --------------------------------------

    #[test]
    fn drop_at_exact_centre_targets_slot_with_full_grip() {
        let g = one(500, 500, 120);
        let (i, d2, r2) = find_target(&g, 500, 500).expect("centre must hit");
        assert_eq!((i, d2, r2), (0, 0, 14_400));
        assert_eq!(grip_bps(d2, r2, 7000, 2000), 7000); // dead centre = base grip
    }

    #[test]
    fn drop_exactly_on_radius_is_inside_and_gets_min_grip() {
        // 3-4-5 triangle scaled: (dx,dz) = (96,72) -> d = 120 exactly, d2 == r2 == 14_400
        let g = one(500, 500, 120);
        let (i, d2, r2) = find_target(&g, 596, 572).expect("boundary is inclusive");
        assert_eq!(i, 0);
        assert_eq!(d2, r2);
        assert_eq!(grip_bps(d2, r2, 7000, 2000), 2000); // exactly min
        // axis-aligned boundary too
        assert!(contains(&g[0], 620, 500));
        assert!(contains(&g[0], 380, 500));
        assert!(contains(&g[0], 500, 620));
        assert!(contains(&g[0], 500, 380));
    }

    #[test]
    fn drop_just_outside_is_a_miss() {
        let g = one(500, 500, 120);
        assert!(find_target(&g, 621, 500).is_none()); // 1 unit beyond, axis aligned
        assert!(find_target(&g, 500, 379).is_none());
        // diagonal, d2 = 14_401 > 14_400: (dx,dz) = (96, 72) plus 1 on x gives 97²+72² = 14_593
        assert!(find_target(&g, 597, 572).is_none());
        // and a tiny hair: d2 = r2 + 1 exactly -> 120² + 1 is not reachable on a lattice,
        // so test the predicate directly through grip_bps clamping
        assert_eq!(grip_bps(14_401, 14_400, 7000, 2000), 2000); // beyond: clamped to min, never below
    }

    // ---- overlapping radii ------------------------------------------------------------

    #[test]
    fn overlap_smallest_d2_over_r2_wins() {
        // A is big and the drop is 50 from its centre (ratio 50²/120² = 0.1736)
        // B is small and the drop is 20 from its centre (ratio 20²/35² = 0.3265)
        // A has the SMALLER ratio, so A wins even though B is physically closer.
        let slots = [
            Geo { x: 450, z: 500, radius: 120 }, // d = 50
            Geo { x: 520, z: 500, radius: 35 },  // d = 20
        ];
        assert_eq!(find_target(&slots, 500, 500).map(|t| t.0), Some(0));

        // Swap which is nearer-in-ratio: now B is dead centre, A is far.
        let slots = [
            Geo { x: 420, z: 500, radius: 120 }, // d = 80, ratio 0.444
            Geo { x: 500, z: 500, radius: 35 },  // d = 0,  ratio 0
        ];
        assert_eq!(find_target(&slots, 500, 500).map(|t| t.0), Some(1));
    }

    #[test]
    fn overlap_exact_tie_goes_to_lower_index() {
        // identical geometry, identical ratio
        let slots = [
            Geo { x: 500, z: 500, radius: 60 },
            Geo { x: 500, z: 500, radius: 60 },
        ];
        assert_eq!(find_target(&slots, 530, 500).map(|t| t.0), Some(0));
        // equal ratio from different radii: d=30,r=60 (0.25) vs d=15,r=30 (0.25)
        let slots = [
            Geo { x: 470, z: 500, radius: 60 },
            Geo { x: 515, z: 500, radius: 30 },
        ];
        assert_eq!(find_target(&slots, 500, 500).map(|t| t.0), Some(0));
        // ...and the same pair reversed: still the lower index
        let slots = [slots[1], slots[0]];
        assert_eq!(find_target(&slots, 500, 500).map(|t| t.0), Some(0));
    }

    #[test]
    fn overlap_only_containing_slots_compete() {
        // slot 0 would have the better ratio if it contained the point, but it does not.
        let slots = [
            Geo { x: 0, z: 0, radius: 10 },
            Geo { x: 500, z: 500, radius: 120 },
        ];
        assert_eq!(find_target(&slots, 530, 500).map(|t| t.0), Some(1));
    }

    // ---- zero radius ------------------------------------------------------------------

    #[test]
    fn zero_radius_slot_is_disabled_even_at_its_exact_centre() {
        let g = one(500, 500, 0);
        assert!(!contains(&g[0], 500, 500));
        assert!(find_target(&g, 500, 500).is_none());
        // a disabled slot never steals a drop from a live one
        let slots = [
            Geo { x: 500, z: 500, radius: 0 },
            Geo { x: 500, z: 500, radius: 45 },
        ];
        assert_eq!(find_target(&slots, 500, 500).map(|t| t.0), Some(1));
    }

    #[test]
    fn zero_r2_grip_cannot_win_and_cannot_divide_by_zero() {
        assert_eq!(grip_bps(0, 0, 7000, 2000), 0);
        assert_eq!(grip_bps(5, 0, 7000, 2000), 0);
    }

    // ---- grip curve -------------------------------------------------------------------

    #[test]
    fn grip_falls_linearly_in_d2_over_r2() {
        // half way in d2 (d2 = r2/2): 2000 + 5000 * 0.5 = 4500
        assert_eq!(grip_bps(7_200, 14_400, 7000, 2000), 4500);
        // quarter: d2 = r2/4 -> 2000 + 5000 * 0.75 = 5750
        assert_eq!(grip_bps(3_600, 14_400, 7000, 2000), 5750);
        // monotone non-increasing as the drop moves away
        let mut prev = u16::MAX;
        for d2 in (0..=14_400u64).step_by(37) {
            let g = grip_bps(d2, 14_400, 7000, 2000);
            assert!(g <= prev, "grip rose at d2={d2}");
            assert!((2000..=7000).contains(&g));
            prev = g;
        }
    }

    #[test]
    fn grip_floor_division_never_exceeds_exact_value() {
        // 1 unit off centre on a 35-radius legendary: exact = 100 + 300*(1225-1)/1225 = 399.755
        assert_eq!(grip_bps(1, 1225, 400, 100), 399); // floor, not 400
    }

    #[test]
    fn grip_degenerate_config_is_clamped() {
        assert_eq!(grip_bps(0, 100, 500, 500), 500); // base == min: flat
        assert_eq!(grip_bps(0, 100, 100, 500), 100); // base < min: never above the ceiling
        assert_eq!(grip_bps(50, 100, 10_000, 0), 5_000);
    }

    #[test]
    fn grip_no_overflow_at_extremes() {
        // largest possible r2 and span
        let r2 = radius2(u16::MAX);
        assert_eq!(grip_bps(0, r2, u16::MAX, 0), u16::MAX);
        assert_eq!(grip_bps(r2, r2, u16::MAX, 0), 0);
        assert_eq!(grip_bps(r2 - 1, r2, u16::MAX, 0), 0); // floor of (65535 * 1 / r2) = 0
        assert_eq!(grip_bps(r2 / 2, r2, u16::MAX, 0), 32_767);
        // the real extremes of the 0..=1000 space
        let g = [Geo { x: 0, z: 0, radius: 120 }, Geo { x: 1000, z: 1000, radius: 35 }];
        assert_eq!(find_target(&g, 0, 0).map(|t| t.0), Some(0));
        assert_eq!(find_target(&g, 1000, 1000).map(|t| t.0), Some(1));
        assert!(find_target(&g, 1000, 0).is_none());
        assert!(find_target(&g, 0, 1000).is_none());
        // slot centre at the corner, drop at the opposite corner, huge radius: still exact
        let big = [Geo { x: 0, z: 0, radius: u16::MAX }];
        let (_, d2, r2) = find_target(&big, 1000, 1000).unwrap();
        assert_eq!(d2, 2_000_000);
        assert_eq!(r2, 4_294_836_225);
        // cross-multiplication in find_target at the largest radii cannot overflow
        let two = [
            Geo { x: 0, z: 0, radius: u16::MAX },
            Geo { x: 1000, z: 1000, radius: u16::MAX },
        ];
        assert_eq!(find_target(&two, 500, 500).map(|t| t.0), Some(0)); // tie -> lower
    }

    // ---- randomness / roll ------------------------------------------------------------

    #[test]
    fn roll_vectors() {
        assert_eq!(roll_bps(&[0u8; 32]), 0);
        let mut one = [0u8; 32];
        one[31] = 1;
        assert_eq!(roll_bps(&one), 1);
        let mut ten_k = [0u8; 32];
        ten_k[30] = 0x27;
        ten_k[31] = 0x10; // 0x2710 = 10000
        assert_eq!(roll_bps(&ten_k), 0);
        ten_k[31] = 0x0f; // 9999
        assert_eq!(roll_bps(&ten_k), 9999);
        // (2^256 - 1) mod 10000, verified independently (python)
        assert_eq!(roll_bps(&[0xffu8; 32]), 9935);
        // big-endian, 0..31: verified independently (python)
        let mut seq = [0u8; 32];
        for (i, b) in seq.iter_mut().enumerate() {
            *b = i as u8;
        }
        assert_eq!(roll_bps(&seq), 671);
    }

    #[test]
    fn roll_always_in_range() {
        let mut s: u64 = 0x9E3779B97F4A7C15;
        for _ in 0..5000 {
            let mut r = [0u8; 32];
            for b in r.iter_mut() {
                s ^= s << 13;
                s ^= s >> 7;
                s ^= s << 17;
                *b = s as u8;
            }
            assert!(roll_bps(&r) < 10_000);
        }
    }

    #[test]
    fn won_is_strictly_less_than_grip() {
        let mut r = [0u8; 32];
        r[30] = 0x0b;
        r[31] = 0xb8; // 3000
        assert_eq!(resolve(&r, 3001), (3000, true)); // roll 3000 < 3001
        assert_eq!(resolve(&r, 3000), (3000, false)); // roll 3000 == grip: loses
        assert_eq!(resolve(&r, 0), (3000, false));
        // grip 0 can never win; grip 10_000 always wins
        assert_eq!(resolve(&[0u8; 32], 0).1, false);
        assert_eq!(resolve(&[0xffu8; 32], 10_000).1, true);
    }

    #[test]
    fn empirical_win_rate_tracks_grip() {
        // not a proof, a smoke test that roll and grip agree on direction and scale
        let mut s: u64 = 0x1234_5678_9ABC_DEF1;
        let (mut wins, n) = (0u32, 20_000u32);
        for _ in 0..n {
            let mut r = [0u8; 32];
            for b in r.iter_mut() {
                s ^= s << 13;
                s ^= s >> 7;
                s ^= s << 17;
                *b = s as u8;
            }
            if resolve(&r, 3000).1 {
                wins += 1;
            }
        }
        let rate = wins as f64 / n as f64; // f64 is fine in a test; never on chain
        assert!((0.28..0.32).contains(&rate), "win rate {rate} not near 0.30");
    }

    // ---- house edge (handoff §3.1) ----------------------------------------------------

    #[test]
    fn best_case_expected_value_stays_under_the_credit() {
        const CREDIT: u64 = 50_000_000; // 0.05 SOL
        const SELLBACK: [u64; 5] = [20_000_000, 50_000_000, 150_000_000, 400_000_000, 1_000_000_000];
        // handoff table: best-case EV per drop <= 0.048 SOL
        let expected_ev: [u64; 5] = [14_000_000, 25_000_000, 45_000_000, 48_000_000, 40_000_000];
        for i in 0..5 {
            let g = grip_bps(0, radius2(R[i]), BASE[i], MIN[i]) as u64;
            let ev = g * SELLBACK[i] / BPS_DENOM as u64;
            assert_eq!(ev, expected_ev[i], "slot {i}");
            assert!(ev <= 48_000_000, "slot {i} best-case EV above 0.048 SOL");
            assert!(ev < CREDIT, "slot {i} lets perfect play drain the vault");
        }
    }
    // ---- several circles per slot -----------------------------------------------------

    const NONE: Geo = Geo { x: 0, z: 0, radius: 0 };
    fn g(x: u16, z: u16, radius: u16) -> Geo {
        Geo { x, z, radius }
    }

    #[test]
    fn a_slot_is_hit_through_any_of_its_circles() {
        let slots = [[g(200, 200, 55), g(800, 800, 55), NONE], [g(500, 500, 45), NONE, NONE]];
        assert_eq!(best_circle(&slots, 200, 200).map(|t| t.0), Some(0));
        assert_eq!(best_circle(&slots, 800, 800).map(|t| t.0), Some(0)); // the second circle of slot 0
        assert_eq!(best_circle(&slots, 500, 500).map(|t| t.0), Some(1));
        assert_eq!(best_circle(&slots, 650, 650), None); // between circles
    }

    #[test]
    fn distance_is_measured_from_the_circle_that_was_hit() {
        let slots = [[g(200, 200, 100), g(800, 800, 100), NONE]];
        // 30 right of the SECOND circle's centre, 600+ from the first
        let (slot, d2, r2) = best_circle(&slots, 830, 800).unwrap();
        assert_eq!((slot, d2, r2), (0, 900, 10_000));
    }

    #[test]
    fn an_unused_circle_never_matches_even_at_its_centre() {
        let slots = [[g(300, 300, 0), g(600, 600, 50), NONE]];
        assert_eq!(best_circle(&slots, 300, 300), None);
        assert_eq!(best_circle(&slots, 600, 600).map(|t| t.0), Some(0));
    }

    #[test]
    fn overlapping_circles_of_different_slots_pick_the_smaller_ratio() {
        // slot 0: r=100 centred 60 away (ratio 0.36); slot 1: r=40 centred 30 away (ratio 0.5625)
        let slots = [[g(560, 500, 100), NONE, NONE], [g(530, 500, 40), NONE, NONE]];
        let (slot, ..) = best_circle(&slots, 500, 500).unwrap();
        assert_eq!(slot, 0);
        // move closer to slot 1's centre: ratio 0.0625 beats slot 0's (30/100)² = 0.09
        let (slot, ..) = best_circle(&slots, 530, 510).unwrap();
        assert_eq!(slot, 1);
    }

    #[test]
    fn an_exact_tie_goes_to_the_lower_slot_then_the_lower_circle() {
        let a = g(500, 500, 50);
        assert_eq!(best_circle(&[[NONE, NONE, NONE], [a, NONE, NONE], [a, NONE, NONE]], 500, 500).map(|t| t.0), Some(1));
        // same slot, two identical circles: still slot 0 (and only one answer)
        assert_eq!(best_circle(&[[a, a, a]], 500, 500).map(|t| t.0), Some(0));
    }

    #[test]
    fn the_boundary_is_inclusive_for_every_circle() {
        let slots = [[NONE, g(100, 100, 50), NONE]];
        assert_eq!(best_circle(&slots, 150, 100), Some((0, 2500, 2500)));
        assert_eq!(best_circle(&slots, 151, 100), None);
    }

    #[test]
    fn one_circle_per_slot_agrees_with_find_target() {
        let geos = [g(357, 629, 120), g(643, 110, 90), g(914, 357, 60), g(357, 110, 45), g(643, 629, 35)];
        let wrapped: [[Geo; 3]; 5] = core::array::from_fn(|i| [geos[i], NONE, NONE]);
        for x in (0..=1000u16).step_by(37) {
            for z in (0..=1000u16).step_by(41) {
                assert_eq!(find_target(&geos, x, z), best_circle(&wrapped, x, z), "({x},{z})");
            }
        }
    }

    #[test]
    fn extremes_do_not_overflow_with_circles() {
        let slots = [[g(0, 0, 1000), g(1000, 1000, 1000), g(1000, 0, 1000)], [g(65535, 65535, 65535), NONE, NONE]];
        assert!(best_circle(&slots, 1000, 1000).is_some());
        assert!(best_circle(&slots, 65535, 65535).is_some());
    }
}
