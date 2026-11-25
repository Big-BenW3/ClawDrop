//! Accounts and the `Play` state machine.
//!
//! Every transition is a pure method on [`Play`] that takes the current time as an argument,
//! so the whole state machine is unit-tested natively (`cargo test`) with no validator. The
//! Anchor handlers in `instructions/` are thin wrappers around these methods.
//!
//! ```text
//!            insert_credit            drop_claw / drop_claw_timeout
//!   Idle ───────────────► Steering ─────────────────────────────┬──► Resolved (miss, no roll)
//!                          │  ▲ nudge                           │
//!                          └──┘                                 └──► Dropped ──grab_callback──► Resolved
//!                                                                          │
//!                                                                          └─force_expire─► Expired
//!   Resolved | Expired ──settle (commit + undelegate)──► back on base ──claim──► prize / refund
//! ```

use anchor_lang::prelude::*;

use crate::errors::ClawError;
use crate::grip::{self, Geo, COORD_MAX};

pub const MACHINE_SEED: &[u8] = b"machine";
pub const VAULT_SEED: &[u8] = b"vault";
pub const PLAY_SEED: &[u8] = b"play";
pub const ASSET_SEED: &[u8] = b"asset";
pub const PRIZE_SEED: &[u8] = b"prize";

/// Metaplex Core program id (checked against the `mpl-core` crate in the tests).
pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

pub const SLOT_COUNT: usize = 5;
/// Target circles per creature. Every plush on the shelf is a circle, so a creature that shows
/// up in several places is winnable in each of them. A circle with radius 0 is unused.
pub const MAX_CIRCLES: usize = 3;
/// `target_slot` value meaning "no creature under the claw".
pub const NO_TARGET: u8 = 255;
pub const START_X: u16 = COORD_MAX / 2;
pub const START_Z: u16 = COORD_MAX / 2;

/// Length of the steering window.
pub const WINDOW_SECS: i64 = 15;
/// Slack on top of the window for clock skew between base and rollup and for in-flight nudges.
pub const GRACE_SECS: i64 = 5;
/// How long a dropped play waits for the VRF callback before anyone may expire it.
pub const CALLBACK_TIMEOUT_SECS: i64 = 30;
/// Lamports the player sends to the pilot key at `insert_credit`.
pub const PILOT_FLOAT_LAMPORTS: u64 = 10_000_000;

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_URI_PREFIX_LEN: usize = 96;

// ---------------------------------------------------------------------------------------------
// Machine (base layer only, never delegated)
// ---------------------------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Machine {
    pub authority: Pubkey,
    pub credit_price_lamports: u64,
    /// Metaplex Core collection; `Pubkey::default()` until `create_collection` runs.
    pub collection: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
    pub paused: bool,
    pub slots: [Slot; SLOT_COUNT],
    #[max_len(96)]
    pub uri_prefix: String,
}

/// One place on the floor where a creature can be grabbed. `radius == 0` means unused.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct Circle {
    pub x_center: u16,
    pub z_center: u16,
    pub radius: u16,
}

impl Circle {
    pub fn geo(&self) -> Geo {
        Geo { x: self.x_center, z: self.z_center, radius: self.radius }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, InitSpace)]
pub struct Slot {
    pub circles: [Circle; MAX_CIRCLES],
    pub base_grip_bps: u16,
    pub min_grip_bps: u16,
    pub sellback_lamports: u64,
    pub supply_cap: u32,
    pub minted: u32,
    #[max_len(32)]
    pub name: String,
}

/// Instruction argument for `set_slot`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SlotConfig {
    pub circles: [Circle; MAX_CIRCLES],
    pub base_grip_bps: u16,
    pub min_grip_bps: u16,
    pub sellback_lamports: u64,
    pub supply_cap: u32,
    pub name: String,
}

impl Slot {
    /// A slot can be targeted only while at least one of its circles has a radius.
    pub fn is_live(&self) -> bool {
        self.circles.iter().any(|c| c.radius > 0)
    }
}

impl Machine {
    /// Largest sell-back among slots that can still mint. The vault must always cover this.
    pub fn max_sellback(&self) -> u64 {
        self.slots
            .iter()
            .filter(|s| s.is_live() && s.minted < s.supply_cap)
            .map(|s| s.sellback_lamports)
            .max()
            .unwrap_or(0)
    }

    pub fn snapshot(&self) -> [SlotSnap; SLOT_COUNT] {
        core::array::from_fn(|i| {
            let s = &self.slots[i];
            SlotSnap {
                circles: s.circles,
                base_grip_bps: s.base_grip_bps,
                min_grip_bps: s.min_grip_bps,
                sellback_lamports: s.sellback_lamports,
            }
        })
    }
}

/// Validates a `set_slot` payload against the machine's credit price.
pub fn validate_slot_config(cfg: &SlotConfig, credit_price_lamports: u64, minted: u32) -> Result<()> {
    require!(cfg.name.len() <= MAX_NAME_LEN, ClawError::NameTooLong);
    require!(
        cfg.circles.iter().all(|c| c.x_center <= COORD_MAX && c.z_center <= COORD_MAX && c.radius <= COORD_MAX)
            && cfg.circles.iter().any(|c| c.radius > 0)
            && cfg.base_grip_bps <= grip::BPS_DENOM as u16
            && cfg.min_grip_bps <= cfg.base_grip_bps
            && cfg.sellback_lamports > 0
            && cfg.supply_cap >= minted
            && cfg.supply_cap > 0,
        ClawError::InvalidSlotConfig
    );
    // Best-case expected value per drop must stay strictly below the credit price, so perfect
    // play can never drain the vault. (handoff §3.1)
    let best_ev = (cfg.base_grip_bps as u128) * (cfg.sellback_lamports as u128) / (grip::BPS_DENOM as u128);
    require!(best_ev < credit_price_lamports as u128, ClawError::HouseEdgeViolation);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Play (delegated per game)
// ---------------------------------------------------------------------------------------------

/// The odds a game is played under, copied from `Machine` at `insert_credit`. The rollup never
/// has to read `Machine`, and the odds cannot change mid-game.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct SlotSnap {
    pub circles: [Circle; MAX_CIRCLES],
    pub base_grip_bps: u16,
    pub min_grip_bps: u16,
    pub sellback_lamports: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub enum PlayState {
    #[default]
    Idle,
    Steering,
    Dropped,
    Resolved,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct Play {
    pub player: Pubkey,
    pub pilot: Pubkey,
    pub machine: Pubkey,
    pub bump: u8,
    pub state: PlayState,
    pub x: u16,
    pub z: u16,
    /// Unix time the game started (base clock at `insert_credit`).
    pub started_at: i64,
    /// Unix time of the drop (rollup clock). Zero until dropped.
    pub dropped_at: i64,
    pub drop_x: u16,
    pub drop_z: u16,
    pub target_slot: u8,
    pub grip_bps: u16,
    pub roll_bps: u16,
    pub won: bool,
    pub claimed: bool,
    /// Incremented on every `insert_credit`; a VRF callback must echo it to be accepted.
    pub vrf_epoch: u32,
    pub nudge_count: u32,
    pub credit_lamports: u64,
    pub snap: [SlotSnap; SLOT_COUNT],
}

/// What a drop decided.
#[derive(Debug, PartialEq, Eq)]
pub enum DropOutcome {
    /// No creature under the claw: resolved as a miss, no randomness requested.
    Miss,
    /// A creature is under the claw: request VRF with these callback arguments.
    Roll { slot: u8, epoch: u32 },
}

/// What a callback did.
#[derive(Debug, PartialEq, Eq)]
pub enum CallbackOutcome {
    Applied,
    /// Wrong state, wrong epoch or wrong slot: ignored, state untouched.
    Ignored,
}

impl Play {
    /// True for an account that was just created and never used.
    pub fn is_fresh(&self) -> bool {
        self.player == Pubkey::default()
    }

    /// A finished game that still owes the player something blocks a new game: an unclaimed
    /// win, or an expired game awaiting its refund. Everything else may be reset.
    pub fn blocks_reset(&self) -> bool {
        if self.is_fresh() || self.claimed {
            return false;
        }
        match self.state {
            PlayState::Resolved => self.won,
            PlayState::Expired => true,
            _ => false, // Idle, or never delegated (Steering/Dropped on base): nothing owed
        }
    }

    /// Start (or restart) a game. Caller has already moved the credit and funded the pilot.
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &mut self,
        player: Pubkey,
        pilot: Pubkey,
        machine: Pubkey,
        bump: u8,
        now: i64,
        credit_lamports: u64,
        snap: [SlotSnap; SLOT_COUNT],
    ) -> Result<()> {
        require!(!self.blocks_reset(), ClawError::PlayLocked);
        let next_epoch = self.vrf_epoch.checked_add(1).ok_or(ClawError::MathOverflow)?;
        self.player = player;
        self.pilot = pilot;
        self.machine = machine;
        self.bump = bump;
        self.state = PlayState::Steering;
        self.x = START_X;
        self.z = START_Z;
        self.started_at = now;
        self.dropped_at = 0;
        self.drop_x = 0;
        self.drop_z = 0;
        self.target_slot = NO_TARGET;
        self.grip_bps = 0;
        self.roll_bps = 0;
        self.won = false;
        self.claimed = false;
        self.vrf_epoch = next_epoch;
        self.nudge_count = 0;
        self.credit_lamports = credit_lamports;
        self.snap = snap;
        Ok(())
    }

    fn window_end(&self) -> i64 {
        self.started_at.saturating_add(WINDOW_SECS + GRACE_SECS)
    }

    /// Move the claw. Both axes are clamped to `0..=COORD_MAX`.
    pub fn apply_nudge(&mut self, dx: i8, dz: i8, now: i64) -> Result<()> {
        require!(self.state == PlayState::Steering, ClawError::WrongState);
        require!(now <= self.window_end(), ClawError::WindowClosed);
        self.x = clamp_axis(self.x, dx);
        self.z = clamp_axis(self.z, dz);
        self.nudge_count = self.nudge_count.checked_add(1).ok_or(ClawError::MathOverflow)?;
        Ok(())
    }

    /// Freeze the drop point and decide whether randomness is needed.
    ///
    /// `timeout` is true for `drop_claw_timeout` (anyone may call it, but only after the window
    /// and grace have elapsed).
    ///
    /// Everything except the dice is decided here: the target slot and the grip depend only on
    /// where the claw is, so they are computed now and stored. The callback only rolls.
    pub fn apply_drop(&mut self, now: i64, timeout: bool) -> Result<DropOutcome> {
        require!(self.state == PlayState::Steering, ClawError::WrongState);
        if timeout {
            require!(now > self.window_end(), ClawError::WindowStillOpen);
        }
        self.drop_x = self.x;
        self.drop_z = self.z;
        self.dropped_at = now;

        let geos: [[Geo; MAX_CIRCLES]; SLOT_COUNT] =
            core::array::from_fn(|i| core::array::from_fn(|c| self.snap[i].circles[c].geo()));
        match grip::best_circle(&geos, self.drop_x, self.drop_z) {
            None => {
                self.target_slot = NO_TARGET;
                self.grip_bps = 0;
                self.won = false;
                self.state = PlayState::Resolved;
                Ok(DropOutcome::Miss)
            }
            Some((i, d2, r2)) => {
                let s = &self.snap[i];
                self.target_slot = i as u8;
                self.grip_bps = grip::grip_bps(d2, r2, s.base_grip_bps, s.min_grip_bps);
                self.state = PlayState::Dropped;
                Ok(DropOutcome::Roll { slot: i as u8, epoch: self.vrf_epoch })
            }
        }
    }

    /// Apply the oracle's randomness. Stale or mismatched callbacks are ignored, never errors:
    /// a callback from a previous game must not resolve (or break) the current one.
    pub fn apply_callback(&mut self, randomness: &[u8; 32], slot: u8, epoch: u32) -> CallbackOutcome {
        if self.state != PlayState::Dropped || epoch != self.vrf_epoch || slot != self.target_slot {
            return CallbackOutcome::Ignored;
        }
        let (roll, won) = grip::resolve(randomness, self.grip_bps);
        self.roll_bps = roll;
        self.won = won;
        self.state = PlayState::Resolved;
        CallbackOutcome::Applied
    }

    /// The callback never arrived: mark the game expired (a refund-eligible miss).
    pub fn apply_expire(&mut self, now: i64) -> Result<()> {
        require!(self.state == PlayState::Dropped, ClawError::WrongState);
        require!(
            now > self.dropped_at.saturating_add(CALLBACK_TIMEOUT_SECS),
            ClawError::CallbackNotTimedOut
        );
        self.won = false;
        self.state = PlayState::Expired;
        Ok(())
    }

    pub fn require_settleable(&self) -> Result<()> {
        require!(
            matches!(self.state, PlayState::Resolved | PlayState::Expired),
            ClawError::WrongState
        );
        Ok(())
    }
}

#[inline]
fn clamp_axis(v: u16, d: i8) -> u16 {
    (v as i32 + d as i32).clamp(0, COORD_MAX as i32) as u16
}

// ---------------------------------------------------------------------------------------------
// Prize and claiming (base layer)
// ---------------------------------------------------------------------------------------------

/// Receipt for a minted prize, at PDA `["prize", asset]`. Lets `sell_back` pay the right amount
/// without parsing Core plugin data, and records that a prize was sold.
#[account]
#[derive(InitSpace)]
pub struct Prize {
    pub slot: u8,
    pub play: Pubkey,
    pub sold: bool,
    /// What the vault pays on sell-back, fixed from the odds the game was played under.
    pub sellback_lamports: u64,
    pub bump: u8,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum RefundReason {
    /// The randomness callback never arrived.
    Expired,
    /// The creature won but its supply cap was reached before the claim.
    SupplyCap,
}

/// What `claim` should do for a finished play.
#[derive(Debug, PartialEq, Eq)]
pub enum ClaimPlan {
    Mint { slot: u8, sellback_lamports: u64 },
    Refund { lamports: u64, reason: RefundReason },
}

/// Decide a claim from the play and the machine's current supply, without touching any account.
pub fn plan_claim(play: &Play, slots: &[Slot; SLOT_COUNT]) -> Result<ClaimPlan> {
    require!(!play.claimed, ClawError::AlreadyClaimed);
    match play.state {
        PlayState::Expired => Ok(ClaimPlan::Refund {
            lamports: play.credit_lamports,
            reason: RefundReason::Expired,
        }),
        PlayState::Resolved if play.won => {
            let i = play.target_slot as usize;
            require!(i < SLOT_COUNT, ClawError::InvalidPlay);
            if slots[i].minted >= slots[i].supply_cap {
                Ok(ClaimPlan::Refund { lamports: play.credit_lamports, reason: RefundReason::SupplyCap })
            } else {
                Ok(ClaimPlan::Mint { slot: play.target_slot, sellback_lamports: play.snap[i].sellback_lamports })
            }
        }
        PlayState::Resolved => err!(ClawError::NothingToClaim),
        _ => err!(ClawError::WrongState),
    }
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_000_000;

    fn snap() -> [SlotSnap; SLOT_COUNT] {
        // Slot 0 sits dead centre of the floor so the default start position (500,500) hits it.
        let mk = |x, z, r, b, m| SlotSnap {
            circles: [Circle { x_center: x, z_center: z, radius: r }, Circle::default(), Circle::default()],
            base_grip_bps: b,
            min_grip_bps: m,
            sellback_lamports: 20_000_000,
        };
        [
            mk(500, 500, 120, 7000, 2000),
            mk(100, 100, 90, 5000, 1200),
            mk(900, 100, 60, 3000, 600),
            mk(100, 900, 45, 1200, 200),
            mk(900, 900, 35, 400, 100),
        ]
    }

    fn player() -> Pubkey {
        Pubkey::new_from_array([1; 32])
    }
    fn pilot() -> Pubkey {
        Pubkey::new_from_array([2; 32])
    }
    fn machine() -> Pubkey {
        Pubkey::new_from_array([3; 32])
    }

    fn blank() -> Play {
        Play {
            player: Pubkey::default(),
            pilot: Pubkey::default(),
            machine: Pubkey::default(),
            bump: 0,
            state: PlayState::Idle,
            x: 0,
            z: 0,
            started_at: 0,
            dropped_at: 0,
            drop_x: 0,
            drop_z: 0,
            target_slot: 0,
            grip_bps: 0,
            roll_bps: 0,
            won: false,
            claimed: false,
            vrf_epoch: 0,
            nudge_count: 0,
            credit_lamports: 0,
            snap: [SlotSnap::default(); SLOT_COUNT],
        }
    }

    fn started() -> Play {
        let mut p = blank();
        p.start(player(), pilot(), machine(), 254, T0, 50_000_000, snap()).unwrap();
        p
    }

    /// Steering -> Dropped on slot 0 (claw at the centre).
    fn dropped() -> Play {
        let mut p = started();
        assert_eq!(p.apply_drop(T0 + 5, false).unwrap(), DropOutcome::Roll { slot: 0, epoch: 1 });
        p
    }

    /// Randomness whose roll is exactly `v`.
    fn rand_roll(v: u16) -> [u8; 32] {
        let mut r = [0u8; 32];
        r[30] = (v >> 8) as u8;
        r[31] = (v & 0xff) as u8;
        r
    }

    fn code<T: core::fmt::Debug>(r: Result<T>) -> u32 {
        match r {
            Err(Error::AnchorError(e)) => e.error_code_number,
            other => panic!("expected an Anchor error, got {other:?}"),
        }
    }
    fn e(c: ClawError) -> u32 {
        c.into()
    }

    // ---- start ------------------------------------------------------------------------

    #[test]
    fn start_puts_the_claw_in_the_middle_and_bumps_the_epoch() {
        let p = started();
        assert_eq!(p.state, PlayState::Steering);
        assert_eq!((p.x, p.z), (500, 500));
        assert_eq!(p.vrf_epoch, 1);
        assert_eq!(p.target_slot, NO_TARGET);
        assert!(!p.won && !p.claimed);
        assert_eq!(p.nudge_count, 0);
        assert_eq!(p.credit_lamports, 50_000_000);
        assert_eq!((p.player, p.pilot, p.machine), (player(), pilot(), machine()));
    }

    #[test]
    fn restart_increments_epoch_and_clears_the_previous_game() {
        let mut p = dropped();
        p.apply_callback(&rand_roll(0), 0, 1); // win
        assert!(p.won);
        p.claimed = true; // prize claimed
        p.start(player(), pilot(), machine(), 254, T0 + 100, 50_000_000, snap()).unwrap();
        assert_eq!(p.vrf_epoch, 2);
        assert_eq!(p.state, PlayState::Steering);
        assert!(!p.won && !p.claimed);
        assert_eq!((p.roll_bps, p.grip_bps, p.target_slot), (0, 0, NO_TARGET));
        assert_eq!((p.x, p.z), (500, 500));
    }

    #[test]
    fn epoch_overflow_is_an_error_not_a_wrap() {
        let mut p = blank();
        p.vrf_epoch = u32::MAX;
        assert_eq!(
            code(p.start(player(), pilot(), machine(), 1, T0, 1, snap())),
            e(ClawError::MathOverflow)
        );
    }

    // ---- reset protection (never erase value owed to the player) ----------------------

    #[test]
    fn unclaimed_win_blocks_a_new_game() {
        let mut p = dropped();
        p.apply_callback(&rand_roll(0), 0, 1);
        assert!(p.won && !p.claimed && p.blocks_reset());
        assert_eq!(
            code(p.start(player(), pilot(), machine(), 254, T0 + 1, 1, snap())),
            e(ClawError::PlayLocked)
        );
    }

    #[test]
    fn unclaimed_expiry_blocks_a_new_game_until_the_refund() {
        let mut p = dropped();
        p.apply_expire(T0 + 5 + CALLBACK_TIMEOUT_SECS + 1).unwrap();
        assert!(p.blocks_reset());
        p.claimed = true;
        assert!(!p.blocks_reset());
    }

    #[test]
    fn a_lost_game_never_blocks() {
        let mut p = dropped();
        p.apply_callback(&rand_roll(9999), 0, 1); // roll 9999 >= grip -> loss
        assert!(!p.won);
        assert!(!p.blocks_reset());
        let mut miss = started();
        miss.x = 0;
        miss.z = 1000; // far from every slot
        assert_eq!(miss.apply_drop(T0 + 1, false).unwrap(), DropOutcome::Miss);
        assert!(!miss.blocks_reset());
    }

    #[test]
    fn fresh_and_never_delegated_plays_do_not_block() {
        assert!(!blank().blocks_reset());
        assert!(!started().blocks_reset()); // Steering on base: delegation never happened
        assert!(!dropped().blocks_reset());
    }

    // ---- nudge ------------------------------------------------------------------------

    #[test]
    fn nudge_moves_and_counts() {
        let mut p = started();
        p.apply_nudge(10, -20, T0 + 1).unwrap();
        assert_eq!((p.x, p.z, p.nudge_count), (510, 480, 1));
    }

    #[test]
    fn nudge_clamps_at_every_edge_including_i8_extremes() {
        let mut p = started();
        for _ in 0..20 {
            p.apply_nudge(127, 127, T0 + 1).unwrap();
        }
        assert_eq!((p.x, p.z), (1000, 1000));
        for _ in 0..20 {
            p.apply_nudge(-128, -128, T0 + 1).unwrap();
        }
        assert_eq!((p.x, p.z), (0, 0));
        // never wraps below zero or above the max
        p.apply_nudge(-128, -1, T0 + 1).unwrap();
        assert_eq!((p.x, p.z), (0, 0));
        assert_eq!(p.nudge_count, 41);
    }

    #[test]
    fn nudge_rejects_every_state_but_steering() {
        for st in [PlayState::Idle, PlayState::Dropped, PlayState::Resolved, PlayState::Expired] {
            let mut p = started();
            p.state = st;
            assert_eq!(code(p.apply_nudge(1, 1, T0 + 1)), e(ClawError::WrongState), "{st:?}");
            assert_eq!(p.nudge_count, 0, "{st:?} must not mutate");
        }
    }

    #[test]
    fn nudge_window_edges() {
        let end = T0 + WINDOW_SECS + GRACE_SECS;
        let mut p = started();
        p.apply_nudge(1, 1, end).unwrap(); // last allowed second
        assert_eq!(code(p.apply_nudge(1, 1, end + 1)), e(ClawError::WindowClosed));
    }

    // ---- drop -------------------------------------------------------------------------

    #[test]
    fn drop_on_a_creature_stores_target_and_grip_and_asks_for_randomness() {
        let mut p = started();
        let out = p.apply_drop(T0 + 5, false).unwrap();
        assert_eq!(out, DropOutcome::Roll { slot: 0, epoch: 1 });
        assert_eq!(p.state, PlayState::Dropped);
        assert_eq!((p.drop_x, p.drop_z), (500, 500));
        assert_eq!(p.target_slot, 0);
        assert_eq!(p.grip_bps, 7000); // dead centre = base grip
        assert_eq!(p.dropped_at, T0 + 5);
    }

    #[test]
    fn drop_off_centre_lowers_the_grip() {
        let mut p = started();
        p.apply_nudge(60, 0, T0 + 1).unwrap(); // 60 of 120: d2/r2 = 0.25
        p.apply_drop(T0 + 2, false).unwrap();
        assert_eq!(p.grip_bps, 2000 + 5000 * 3 / 4); // 5750
    }

    #[test]
    fn drop_on_empty_floor_is_a_miss_with_no_roll() {
        let mut p = started();
        for _ in 0..4 {
            p.apply_nudge(127, 0, T0 + 1).unwrap();
        } // x = 1000, z = 500: nothing there
        assert_eq!(p.apply_drop(T0 + 2, false).unwrap(), DropOutcome::Miss);
        assert_eq!(p.state, PlayState::Resolved);
        assert!(!p.won);
        assert_eq!(p.target_slot, NO_TARGET);
        assert_eq!(p.grip_bps, 0);
    }

    #[test]
    fn drop_rejects_every_state_but_steering() {
        for st in [PlayState::Idle, PlayState::Dropped, PlayState::Resolved, PlayState::Expired] {
            for timeout in [false, true] {
                let mut p = started();
                p.state = st;
                assert_eq!(code(p.apply_drop(T0 + 999, timeout)), e(ClawError::WrongState), "{st:?}");
                assert_eq!(p.dropped_at, 0, "{st:?} must not mutate");
            }
        }
    }

    #[test]
    fn timeout_drop_only_after_the_window_and_grace() {
        let end = T0 + WINDOW_SECS + GRACE_SECS;
        let mut p = started();
        assert_eq!(code(p.apply_drop(T0 + 1, true)), e(ClawError::WindowStillOpen));
        assert_eq!(code(p.apply_drop(end, true)), e(ClawError::WindowStillOpen)); // still allowed to nudge here
        assert_eq!(p.state, PlayState::Steering);
        p.apply_drop(end + 1, true).unwrap();
        assert_eq!(p.state, PlayState::Dropped);
    }

    #[test]
    fn the_pilot_may_drop_at_any_moment_while_steering() {
        let mut p = started();
        p.apply_drop(T0 + 10_000, false).unwrap(); // long after the window: still accepted
        assert_eq!(p.state, PlayState::Dropped);
    }

    // ---- callback ---------------------------------------------------------------------

    #[test]
    fn callback_wins_when_roll_is_below_grip() {
        let mut p = dropped(); // grip 7000
        assert_eq!(p.apply_callback(&rand_roll(6999), 0, 1), CallbackOutcome::Applied);
        assert_eq!((p.state, p.won, p.roll_bps), (PlayState::Resolved, true, 6999));
    }

    #[test]
    fn callback_loses_when_roll_equals_or_exceeds_grip() {
        let mut p = dropped();
        p.apply_callback(&rand_roll(7000), 0, 1);
        assert_eq!((p.state, p.won, p.roll_bps), (PlayState::Resolved, false, 7000));
    }

    #[test]
    fn stale_epoch_callback_is_ignored_and_changes_nothing() {
        let mut p = dropped(); // epoch 1
        let before = (p.state, p.won, p.roll_bps);
        assert_eq!(p.apply_callback(&rand_roll(0), 0, 0), CallbackOutcome::Ignored); // old epoch
        assert_eq!(p.apply_callback(&rand_roll(0), 0, 2), CallbackOutcome::Ignored); // future epoch
        assert_eq!((p.state, p.won, p.roll_bps), before);
        assert_eq!(p.state, PlayState::Dropped);
    }

    #[test]
    fn a_callback_from_a_previous_game_cannot_resolve_the_current_one() {
        // game 1 is dropped; the player restarts (epoch 2) before the oracle answers game 1
        let mut p = dropped();
        p.state = PlayState::Resolved; // pretend game 1 ended some other way
        p.won = false;
        p.start(player(), pilot(), machine(), 254, T0 + 100, 1, snap()).unwrap();
        p.apply_drop(T0 + 101, false).unwrap(); // game 2 dropped, epoch 2
        assert_eq!(p.vrf_epoch, 2);
        // the late game-1 callback arrives, echoing epoch 1
        assert_eq!(p.apply_callback(&rand_roll(0), 0, 1), CallbackOutcome::Ignored);
        assert_eq!(p.state, PlayState::Dropped); // game 2 is untouched
    }

    #[test]
    fn callback_with_the_wrong_slot_is_ignored() {
        let mut p = dropped(); // target slot 0
        assert_eq!(p.apply_callback(&rand_roll(0), 3, 1), CallbackOutcome::Ignored);
        assert_eq!(p.state, PlayState::Dropped);
    }

    #[test]
    fn callback_is_ignored_in_every_state_but_dropped() {
        for st in [PlayState::Idle, PlayState::Steering, PlayState::Resolved, PlayState::Expired] {
            let mut p = dropped();
            p.state = st;
            assert_eq!(p.apply_callback(&rand_roll(0), 0, 1), CallbackOutcome::Ignored, "{st:?}");
            assert_eq!(p.state, st);
            assert!(!p.won);
        }
    }

    #[test]
    fn a_replayed_callback_cannot_overwrite_the_result() {
        let mut p = dropped();
        p.apply_callback(&rand_roll(0), 0, 1); // win
        assert!(p.won);
        assert_eq!(p.apply_callback(&rand_roll(9999), 0, 1), CallbackOutcome::Ignored); // replay would lose
        assert!(p.won && p.roll_bps == 0);
    }

    #[test]
    fn a_callback_after_expiry_cannot_resurrect_the_game() {
        let mut p = dropped();
        p.apply_expire(T0 + 5 + CALLBACK_TIMEOUT_SECS + 1).unwrap();
        assert_eq!(p.apply_callback(&rand_roll(0), 0, 1), CallbackOutcome::Ignored);
        assert_eq!(p.state, PlayState::Expired);
        assert!(!p.won);
    }

    // ---- expire -----------------------------------------------------------------------

    #[test]
    fn expire_only_after_the_callback_timeout() {
        let at = T0 + 5;
        let mut p = dropped();
        assert_eq!(code(p.apply_expire(at + 1)), e(ClawError::CallbackNotTimedOut));
        assert_eq!(code(p.apply_expire(at + CALLBACK_TIMEOUT_SECS)), e(ClawError::CallbackNotTimedOut));
        p.apply_expire(at + CALLBACK_TIMEOUT_SECS + 1).unwrap();
        assert_eq!((p.state, p.won), (PlayState::Expired, false));
    }

    #[test]
    fn expire_rejects_every_state_but_dropped() {
        for st in [PlayState::Idle, PlayState::Steering, PlayState::Resolved, PlayState::Expired] {
            let mut p = dropped();
            p.state = st;
            assert_eq!(code(p.apply_expire(T0 + 10_000)), e(ClawError::WrongState), "{st:?}");
            assert_eq!(p.state, st);
        }
    }

    // ---- settle -----------------------------------------------------------------------

    #[test]
    fn settle_only_from_resolved_or_expired() {
        for (st, ok) in [
            (PlayState::Idle, false),
            (PlayState::Steering, false),
            (PlayState::Dropped, false),
            (PlayState::Resolved, true),
            (PlayState::Expired, true),
        ] {
            let mut p = started();
            p.state = st;
            assert_eq!(p.require_settleable().is_ok(), ok, "{st:?}");
        }
    }

    // ---- set_slot validation / house edge ---------------------------------------------

    fn cfg() -> SlotConfig {
        SlotConfig {
            circles: [Circle { x_center: 500, z_center: 500, radius: 120 }, Circle::default(), Circle::default()],
            base_grip_bps: 7000,
            min_grip_bps: 2000,
            sellback_lamports: 20_000_000,
            supply_cap: 10_000,
            name: "Common".into(),
        }
    }
    const PRICE: u64 = 50_000_000;

    #[test]
    fn the_five_handoff_slots_all_pass_the_house_edge_check() {
        for (b, m, sb) in [
            (7000, 2000, 20_000_000),
            (5000, 1200, 50_000_000),
            (3000, 600, 150_000_000),
            (1200, 200, 400_000_000),
            (400, 100, 1_000_000_000),
        ] {
            let mut c = cfg();
            c.base_grip_bps = b;
            c.min_grip_bps = m;
            c.sellback_lamports = sb;
            validate_slot_config(&c, PRICE, 0).unwrap_or_else(|_| panic!("{b} bps x {sb}"));
        }
    }

    #[test]
    fn a_slot_whose_best_case_ev_reaches_the_price_is_rejected() {
        let mut c = cfg();
        c.base_grip_bps = 5000;
        c.sellback_lamports = 100_000_000; // EV = 50_000_000 == price: not strictly below
        assert_eq!(code(validate_slot_config(&c, PRICE, 0)), e(ClawError::HouseEdgeViolation));
        c.sellback_lamports = 99_999_999;
        validate_slot_config(&c, PRICE, 0).unwrap();
    }

    #[test]
    fn slot_config_range_checks() {
        let bad: Vec<Box<dyn Fn(&mut SlotConfig)>> = vec![
            Box::new(|c| c.circles[0].x_center = 1001),
            Box::new(|c| c.circles[0].z_center = 1001),
            Box::new(|c| c.circles[0].radius = 1001),
            Box::new(|c| c.circles[2].x_center = 1001), // every circle is range-checked, even an unused one
            Box::new(|c| c.circles[1].radius = 1001),
            Box::new(|c| c.circles[0].radius = 0), // no live circle at all
            Box::new(|c| c.base_grip_bps = 10_001),
            Box::new(|c| c.min_grip_bps = c.base_grip_bps + 1),
            Box::new(|c| c.sellback_lamports = 0),
            Box::new(|c| c.supply_cap = 0),
        ];
        for (i, f) in bad.iter().enumerate() {
            let mut c = cfg();
            f(&mut c);
            assert_eq!(code(validate_slot_config(&c, PRICE, 0)), e(ClawError::InvalidSlotConfig), "case {i}");
        }
        let mut c = cfg();
        c.supply_cap = 5;
        assert_eq!(code(validate_slot_config(&c, PRICE, 6)), e(ClawError::InvalidSlotConfig)); // below minted
        c.name = "x".repeat(33);
        assert_eq!(code(validate_slot_config(&c, PRICE, 0)), e(ClawError::NameTooLong));
    }

    fn one_circle() -> [Circle; MAX_CIRCLES] {
        [Circle { x_center: 500, z_center: 500, radius: 50 }, Circle::default(), Circle::default()]
    }

    #[test]
    fn max_sellback_ignores_sold_out_and_disabled_slots() {
        let mut m = Machine {
            authority: Pubkey::default(),
            credit_price_lamports: PRICE,
            collection: Pubkey::default(),
            bump: 0,
            vault_bump: 0,
            paused: false,
            slots: core::array::from_fn(|_| Slot::default()),
            uri_prefix: String::new(),
        };
        assert_eq!(m.max_sellback(), 0);
        for (i, sb) in [20u64, 50, 150, 400, 1000].iter().enumerate() {
            m.slots[i] = Slot { circles: one_circle(), sellback_lamports: sb * 1_000_000, supply_cap: 10, ..Default::default() };
        }
        assert_eq!(m.max_sellback(), 1_000_000_000);
        m.slots[4].minted = 10; // legendary sold out
        assert_eq!(m.max_sellback(), 400_000_000);
        m.slots[3].circles = [Circle::default(); MAX_CIRCLES]; // epic disabled
        assert_eq!(m.max_sellback(), 150_000_000);
    }

    // ---- claim planning ---------------------------------------------------------------

    fn slots_with(minted: u32, cap: u32) -> [Slot; SLOT_COUNT] {
        core::array::from_fn(|_| Slot { minted, supply_cap: cap, circles: one_circle(), ..Default::default() })
    }
    fn won_play() -> Play {
        let mut p = dropped();
        p.apply_callback(&rand_roll(0), 0, 1);
        assert!(p.won);
        p
    }

    #[test]
    fn a_win_plans_a_mint_with_the_snapshotted_sellback() {
        let p = won_play();
        assert_eq!(
            plan_claim(&p, &slots_with(0, 10)).unwrap(),
            ClaimPlan::Mint { slot: 0, sellback_lamports: 20_000_000 }
        );
    }

    #[test]
    fn a_win_with_the_supply_cap_reached_is_refunded() {
        let p = won_play();
        assert_eq!(
            plan_claim(&p, &slots_with(10, 10)).unwrap(),
            ClaimPlan::Refund { lamports: 50_000_000, reason: RefundReason::SupplyCap }
        );
        assert!(matches!(plan_claim(&p, &slots_with(9, 10)).unwrap(), ClaimPlan::Mint { .. }));
    }

    #[test]
    fn an_expired_play_is_refunded_its_credit() {
        let mut p = dropped();
        p.apply_expire(T0 + 5 + CALLBACK_TIMEOUT_SECS + 1).unwrap();
        assert_eq!(
            plan_claim(&p, &slots_with(0, 10)).unwrap(),
            ClaimPlan::Refund { lamports: 50_000_000, reason: RefundReason::Expired }
        );
    }

    #[test]
    fn a_loss_or_a_miss_has_nothing_to_claim() {
        let mut lost = dropped();
        lost.apply_callback(&rand_roll(9999), 0, 1);
        assert_eq!(code(plan_claim(&lost, &slots_with(0, 10))), e(ClawError::NothingToClaim));
        let mut miss = started();
        miss.x = 0;
        miss.z = 1000;
        miss.apply_drop(T0 + 1, false).unwrap();
        assert_eq!(code(plan_claim(&miss, &slots_with(0, 10))), e(ClawError::NothingToClaim));
    }

    #[test]
    fn a_play_can_only_be_claimed_once() {
        let mut p = won_play();
        p.claimed = true;
        assert_eq!(code(plan_claim(&p, &slots_with(0, 10))), e(ClawError::AlreadyClaimed));
        let mut x = dropped();
        x.apply_expire(T0 + 5 + CALLBACK_TIMEOUT_SECS + 1).unwrap();
        x.claimed = true;
        assert_eq!(code(plan_claim(&x, &slots_with(0, 10))), e(ClawError::AlreadyClaimed));
    }

    #[test]
    fn claiming_before_the_game_is_over_is_rejected() {
        for st in [PlayState::Idle, PlayState::Steering, PlayState::Dropped] {
            let mut p = won_play();
            p.state = st;
            assert_eq!(code(plan_claim(&p, &slots_with(0, 10))), e(ClawError::WrongState), "{st:?}");
        }
    }

    #[test]
    fn a_corrupt_target_slot_cannot_index_out_of_range() {
        let mut p = won_play();
        p.target_slot = NO_TARGET; // won but pointing at nothing
        assert_eq!(code(plan_claim(&p, &slots_with(0, 10))), e(ClawError::InvalidPlay));
    }

    #[test]
    fn the_hardcoded_core_program_id_matches_the_mpl_core_crate() {
        assert_eq!(MPL_CORE_ID.to_bytes(), mpl_core::ID.to_bytes());
    }

    #[test]
    fn every_game_of_the_same_play_gets_its_own_asset_address() {
        let play = Pubkey::new_unique();
        let addr = |epoch: u32| {
            Pubkey::find_program_address(&[ASSET_SEED, play.as_ref(), &epoch.to_le_bytes()], &crate::ID).0
        };
        assert_eq!(addr(1), addr(1)); // deterministic: a claim can be retried
        assert_ne!(addr(1), addr(2)); // a returning player's next win must not collide
        assert_ne!(addr(2), addr(3));
    }
    // ---- several circles per slot -----------------------------------------------------

    fn circ(x: u16, z: u16, r: u16) -> Circle {
        Circle { x_center: x, z_center: z, radius: r }
    }

    /// Slot 0 owns three circles; slot 1 owns one. Nothing is near the start position (500,500).
    fn multi_snap() -> [SlotSnap; SLOT_COUNT] {
        let mut sn = snap();
        sn[0].circles = [circ(200, 200, 55), circ(800, 200, 55), circ(200, 800, 55)];
        sn[1].circles = [circ(800, 800, 45), Circle::default(), Circle::default()];
        for i in 2..SLOT_COUNT {
            sn[i].circles = [Circle::default(); MAX_CIRCLES];
        }
        sn
    }

    fn drop_at(x: u16, z: u16) -> (Play, DropOutcome) {
        let mut p = blank();
        p.start(player(), pilot(), machine(), 254, T0, 50_000_000, multi_snap()).unwrap();
        p.x = x;
        p.z = z;
        let out = p.apply_drop(T0 + 5, false).unwrap();
        (p, out)
    }

    #[test]
    fn dropping_on_any_circle_of_a_creature_targets_that_creature() {
        for (x, z) in [(200, 200), (800, 200), (200, 800)] {
            let (p, out) = drop_at(x, z);
            assert_eq!(out, DropOutcome::Roll { slot: 0, epoch: 1 }, "({x},{z})");
            assert_eq!(p.grip_bps, 7000, "dead centre of a circle gives the creature's full grip");
        }
        let (p, out) = drop_at(800, 800);
        assert_eq!(out, DropOutcome::Roll { slot: 1, epoch: 1 });
        assert_eq!(p.grip_bps, 5000);
    }

    #[test]
    fn grip_falls_off_from_the_circle_that_was_hit() {
        // 55 from the second circle's centre = exactly its edge: the creature's minimum grip
        let (p, _) = drop_at(855, 200);
        assert_eq!((p.target_slot, p.grip_bps), (0, 2000));
        // half way out: d2/r2 = 0.25, so 2000 + 5000 * 0.75
        let (p, _) = drop_at(800 + 27, 200);
        assert_eq!(p.target_slot, 0);
        assert!((5000..5800).contains(&p.grip_bps), "{}", p.grip_bps);
    }

    #[test]
    fn between_circles_and_on_an_unused_circle_is_a_miss() {
        let (p, out) = drop_at(500, 500);
        assert_eq!(out, DropOutcome::Miss);
        assert_eq!((p.state, p.target_slot), (PlayState::Resolved, NO_TARGET));
        // slot 1's unused circles sit at (0,0) with radius 0
        let (_, out) = drop_at(0, 0);
        assert_eq!(out, DropOutcome::Miss);
    }

    #[test]
    fn a_slot_is_live_if_any_circle_is_live_and_dead_if_none_is() {
        let mut s = Slot { circles: [Circle::default(); MAX_CIRCLES], ..Default::default() };
        assert!(!s.is_live());
        s.circles[2] = circ(10, 10, 5);
        assert!(s.is_live());
    }

    #[test]
    fn the_snapshot_carries_every_circle() {
        let mut m = Machine {
            authority: Pubkey::default(),
            credit_price_lamports: PRICE,
            collection: Pubkey::default(),
            bump: 0,
            vault_bump: 0,
            paused: false,
            slots: core::array::from_fn(|_| Slot::default()),
            uri_prefix: String::new(),
        };
        m.slots[2].circles = [circ(1, 2, 3), circ(4, 5, 6), circ(7, 8, 9)];
        assert_eq!(m.snapshot()[2].circles, m.slots[2].circles);
    }

    #[test]
    fn a_circle_set_with_one_live_circle_validates() {
        let mut c = cfg();
        c.circles = [Circle::default(), Circle::default(), circ(900, 900, 22)];
        validate_slot_config(&c, PRICE, 0).unwrap();
    }
}
