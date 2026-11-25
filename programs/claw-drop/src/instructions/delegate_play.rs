use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::errors::ClawError;
use crate::state::*;
use crate::{DelegatePlay, ALLOWED_VALIDATORS};

/// Hands the `Play` to a rollup validator. The validator is passed as the first remaining
/// account and must be on the allowed list: it can commit arbitrary state back to base.
pub fn handler(ctx: Context<DelegatePlay>) -> Result<()> {
    let validator = ctx.remaining_accounts.first().ok_or(ClawError::MissingValidator)?.key();
    require!(ALLOWED_VALIDATORS.contains(&validator), ClawError::ValidatorNotAllowed);

    // Checked by hand: `Account<Play>` would reject an account whose owner is about to change.
    require_keys_eq!(*ctx.accounts.play.owner, crate::ID, ClawError::InvalidPlay);
    let play = {
        let data = ctx.accounts.play.try_borrow_data()?;
        Play::try_deserialize(&mut &data[..])?
    };
    require_keys_eq!(play.player, ctx.accounts.player.key(), ClawError::NotPlayer);
    require_keys_eq!(play.machine, ctx.accounts.machine.key(), ClawError::InvalidPlay);
    require!(play.state == PlayState::Steering, ClawError::WrongState);

    let machine_key = ctx.accounts.machine.key();
    let player_key = ctx.accounts.player.key();
    ctx.accounts.delegate_play(
        &ctx.accounts.player,
        &[PLAY_SEED, machine_key.as_ref(), player_key.as_ref()],
        DelegateConfig { validator: Some(validator), ..Default::default() },
    )?;
    Ok(())
}
