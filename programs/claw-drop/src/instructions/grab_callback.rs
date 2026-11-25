use anchor_lang::prelude::*;

use crate::state::*;
use crate::GrabCallback;

/// Rolls the dice for a dropped play. A stale or mismatched callback is ignored, not an error.
pub fn handler(ctx: Context<GrabCallback>, randomness: [u8; 32], slot: u8, epoch: u32) -> Result<()> {
    match ctx.accounts.play.apply_callback(&randomness, slot, epoch) {
        CallbackOutcome::Applied => {
            let p = &ctx.accounts.play;
            msg!("grip={} roll={} won={}", p.grip_bps, p.roll_bps, p.won);
        }
        CallbackOutcome::Ignored => msg!("ignored stale or mismatched callback"),
    }
    Ok(())
}
