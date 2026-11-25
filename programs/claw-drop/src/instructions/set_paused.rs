use anchor_lang::prelude::*;

use crate::AdminMachine;

pub fn handler(ctx: Context<AdminMachine>, paused: bool) -> Result<()> {
    ctx.accounts.machine.paused = paused;
    Ok(())
}
