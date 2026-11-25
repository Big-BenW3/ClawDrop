use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::errors::ClawError;
use crate::Settle;

/// Commits the finished `Play` back to base and undelegates it. Only the pilot or the player
/// may settle, and only once the game is Resolved or Expired.
pub fn handler(ctx: Context<Settle>) -> Result<()> {
    let play = &ctx.accounts.play;
    let who = ctx.accounts.payer.key();
    require!(who == play.pilot || who == play.player, ClawError::NotPlayerOrPilot);
    play.require_settleable()?;

    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.play.to_account_info()])
    .build_and_invoke()?;
    Ok(())
}
