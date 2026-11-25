use anchor_lang::prelude::*;

use crate::Nudge;

pub fn handler(ctx: Context<Nudge>, dx: i8, dz: i8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.play.apply_nudge(dx, dz, now)
}
