use anchor_lang::prelude::*;

use crate::ForceExpire;

/// Anyone may expire a dropped play whose randomness callback never arrived.
pub fn handler(ctx: Context<ForceExpire>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.play.apply_expire(now)
}
