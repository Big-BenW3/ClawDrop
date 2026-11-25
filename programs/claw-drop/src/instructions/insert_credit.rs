use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::errors::ClawError;
use crate::state::*;
use crate::InsertCredit;

/// Pays the credit into the vault, funds the pilot key, and (re)initialises the `Play` in
/// Steering. The same transaction must then call `delegate_play`: the two are one wallet
/// approval. Refuses to overwrite a game that still owes the player a prize or refund.
pub fn handler(ctx: Context<InsertCredit>, pilot_key: Pubkey) -> Result<()> {
    let machine = &ctx.accounts.machine;
    require!(!machine.paused, ClawError::MachinePaused);
    let price = machine.credit_price_lamports;
    let snap = machine.snapshot();
    let max_sellback = machine.max_sellback();
    let machine_key = machine.key();
    let player_key = ctx.accounts.player.key();

    // Validate and mutate the play first: a locked play fails before any lamports move.
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts
        .play
        .start(player_key, pilot_key, machine_key, ctx.bumps.play, now, price, snap)?;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.player.to_account_info(), to: ctx.accounts.vault.to_account_info() },
        ),
        price,
    )?;
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.player.to_account_info(), to: ctx.accounts.pilot.to_account_info() },
        ),
        PILOT_FLOAT_LAMPORTS,
    )?;

    // Every win can be sold back, so the vault must always cover the top sell-back.
    require!(ctx.accounts.vault.lamports() >= max_sellback, ClawError::VaultUnderfunded);
    Ok(())
}
