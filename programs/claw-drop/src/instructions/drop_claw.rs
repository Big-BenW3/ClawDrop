use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::vrf::{
    instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

use crate::state::*;
use crate::{DropClaw, DropClawTimeout};

/// Builds the VRF request for a drop. The callback receives `(randomness, slot, epoch)`: the
/// oracle appends `callback_args` after the randomness.
fn request_ix(
    payer: Pubkey,
    oracle_queue: Pubkey,
    play: Pubkey,
    slot: u8,
    epoch: u32,
) -> anchor_lang::solana_program::instruction::Instruction {
    let mut args = Vec::with_capacity(5);
    args.push(slot);
    args.extend_from_slice(&epoch.to_le_bytes());

    // Unique per (play, epoch) so no two requests share a seed.
    let mut seed = play.to_bytes();
    seed[28..].copy_from_slice(&epoch.to_le_bytes());

    create_request_scoped_randomness_ix(RequestRandomnessParams {
        payer,
        oracle_queue,
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::GrabCallback::DISCRIMINATOR.to_vec(),
        caller_seed: seed,
        accounts_metas: Some(vec![SerializableAccountMeta {
            pubkey: play,
            is_signer: false,
            is_writable: true,
        }]),
        callback_args: Some(args),
        ..Default::default()
    })
}

pub fn handler(ctx: Context<DropClaw>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let outcome = ctx.accounts.play.apply_drop(now, false)?;
    if let DropOutcome::Roll { slot, epoch } = outcome {
        let ix = request_ix(
            ctx.accounts.pilot.key(),
            ctx.accounts.oracle_queue.key(),
            ctx.accounts.play.key(),
            slot,
            epoch,
        );
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.pilot.to_account_info(), &ix)?;
    }
    Ok(())
}

pub fn handler_timeout(ctx: Context<DropClawTimeout>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let outcome = ctx.accounts.play.apply_drop(now, true)?;
    if let DropOutcome::Roll { slot, epoch } = outcome {
        let ix = request_ix(
            ctx.accounts.payer.key(),
            ctx.accounts.oracle_queue.key(),
            ctx.accounts.play.key(),
            slot,
            epoch,
        );
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
    }
    Ok(())
}
