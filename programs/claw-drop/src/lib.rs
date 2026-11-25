//! Claw Drop: a provably fair onchain claw machine.
//!
//! * Base layer: machine setup, `insert_credit` + `delegate_play` (one transaction), `claim`,
//!   `sell_back`.
//! * Ephemeral rollup: `nudge`, `drop_claw`, the VRF callback `grab_callback`, `force_expire`,
//!   `settle`.
//!
//! The `Machine` account is never delegated and never touched inside the rollup: each game
//! carries a snapshot of the odds in its own `Play` account.

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};

pub mod errors;
pub mod grip;
pub mod instructions;
pub mod state;

use errors::ClawError;
use state::*;

declare_id!("CSA1f5uS1W8AgdE1esXcujmZ9FUHan3icDXXRwFiyhdG");

/// Rollup validators a `Play` may be delegated to (handoff §2.3: EU and US devnet).
///
/// A delegated account is committed back to base by its validator, so the validator is a
/// trusted party. If the player could name any validator they could delegate to a key they
/// control and commit `won = true`. Only these identities are accepted.
pub const ALLOWED_VALIDATORS: [Pubkey; 2] = [
    pubkey!("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
    pubkey!("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
];

#[ephemeral]
#[program]
pub mod claw_drop {
    use super::*;

    // ---- base layer: setup (authority only) ---------------------------------------------

    pub fn init_machine(
        ctx: Context<InitMachine>,
        credit_price_lamports: u64,
        uri_prefix: String,
    ) -> Result<()> {
        instructions::init_machine::handler(ctx, credit_price_lamports, uri_prefix)
    }

    pub fn set_slot(ctx: Context<AdminMachine>, index: u8, config: SlotConfig) -> Result<()> {
        instructions::set_slot::handler(ctx, index, config)
    }

    pub fn set_paused(ctx: Context<AdminMachine>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }

    pub fn set_uri_prefix(ctx: Context<AdminMachine>, uri_prefix: String) -> Result<()> {
        instructions::set_uri_prefix::handler(ctx, uri_prefix)
    }

    pub fn close_machine(ctx: Context<CloseMachine>) -> Result<()> {
        instructions::close_machine::handler(ctx)
    }

    pub fn set_collection(ctx: Context<SetCollection>) -> Result<()> {
        instructions::set_collection::handler(ctx)
    }

    pub fn create_collection(ctx: Context<CreateCollection>, name: String, uri: String) -> Result<()> {
        instructions::create_collection::handler(ctx, name, uri)
    }

    // ---- base layer: start a game (same transaction, one wallet approval) ---------------

    pub fn insert_credit(ctx: Context<InsertCredit>, pilot_key: Pubkey) -> Result<()> {
        instructions::insert_credit::handler(ctx, pilot_key)
    }

    pub fn delegate_play(ctx: Context<DelegatePlay>) -> Result<()> {
        instructions::delegate_play::handler(ctx)
    }

    // ---- base layer: after the game ------------------------------------------------------

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    pub fn sell_back(ctx: Context<SellBack>) -> Result<()> {
        instructions::sell_back::handler(ctx)
    }

    // ---- rollup: play ----------------------------------------------------------------------

    pub fn nudge(ctx: Context<Nudge>, dx: i8, dz: i8) -> Result<()> {
        instructions::nudge::handler(ctx, dx, dz)
    }

    pub fn drop_claw(ctx: Context<DropClaw>) -> Result<()> {
        instructions::drop_claw::handler(ctx)
    }

    pub fn drop_claw_timeout(ctx: Context<DropClawTimeout>) -> Result<()> {
        instructions::drop_claw::handler_timeout(ctx)
    }

    pub fn grab_callback(
        ctx: Context<GrabCallback>,
        randomness: [u8; 32],
        slot: u8,
        epoch: u32,
    ) -> Result<()> {
        instructions::grab_callback::handler(ctx, randomness, slot, epoch)
    }

    pub fn force_expire(ctx: Context<ForceExpire>) -> Result<()> {
        instructions::force_expire::handler(ctx)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handler(ctx)
    }
}

// =============================================================================================
// Account contexts
// =============================================================================================

#[derive(Accounts)]
pub struct InitMachine<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Machine::INIT_SPACE,
        seeds = [MACHINE_SEED, authority.key().as_ref()],
        bump
    )]
    pub machine: Account<'info, Machine>,
    /// CHECK: system-owned vault PDA; only its bump is recorded here.
    #[account(seeds = [VAULT_SEED, machine.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseMachine<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: the machine PDA of this authority, possibly in an older layout that no longer
    /// deserialises. The seeds bind it to the signer; the owner check rules out foreign accounts.
    #[account(mut, owner = crate::ID, seeds = [MACHINE_SEED, authority.key().as_ref()], bump)]
    pub machine: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SetCollection<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ ClawError::Unauthorized)]
    pub machine: Account<'info, Machine>,
    /// CHECK: an existing Core collection; owner, type and update authority are checked in the handler.
    pub collection: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct AdminMachine<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ ClawError::Unauthorized)]
    pub machine: Account<'info, Machine>,
}

#[derive(Accounts)]
#[instruction(pilot_key: Pubkey)]
pub struct InsertCredit<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [MACHINE_SEED, machine.authority.as_ref()], bump = machine.bump)]
    pub machine: Account<'info, Machine>,
    /// CHECK: system-owned vault PDA holding credits and sell-back funds.
    #[account(mut, seeds = [VAULT_SEED, machine.key().as_ref()], bump = machine.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: the browser-held pilot key; it only receives the fee float.
    #[account(mut, address = pilot_key)]
    pub pilot: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Play::INIT_SPACE,
        seeds = [PLAY_SEED, machine.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub play: Account<'info, Play>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePlay<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: only used to derive the play seeds; verified against `play.machine`.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: the Play PDA to delegate; its data is checked by hand because the Anchor owner
    /// check is not usable on an account that is about to change owner.
    #[account(mut, del, seeds = [PLAY_SEED, machine.key().as_ref(), player.key().as_ref()], bump)]
    pub play: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Nudge<'info> {
    pub pilot: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump,
        has_one = pilot @ ClawError::NotPilot
    )]
    pub play: Account<'info, Play>,
}

#[vrf]
#[derive(Accounts)]
pub struct DropClaw<'info> {
    #[account(mut)]
    pub pilot: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump,
        has_one = pilot @ ClawError::NotPilot
    )]
    pub play: Account<'info, Play>,
    /// CHECK: the rollup's delegated VRF queue. It must be writable or the request CPI fails
    /// with PrivilegeEscalation.
    #[account(mut, address = ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct DropClawTimeout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump
    )]
    pub play: Account<'info, Play>,
    /// CHECK: see `DropClaw::oracle_queue`.
    #[account(mut, address = ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// `#[vrf_callback]` injects `vrf_program_identity`, a signer constrained to the scoped VRF
/// identity of *this* program, so only randomness this program requested can reach here.
#[vrf_callback]
#[derive(Accounts)]
pub struct GrabCallback<'info> {
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump
    )]
    pub play: Account<'info, Play>,
}

#[derive(Accounts)]
pub struct ForceExpire<'info> {
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump
    )]
    pub play: Account<'info, Play>,
}

#[commit]
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, play.machine.as_ref(), play.player.as_ref()],
        bump = play.bump
    )]
    pub play: Account<'info, Play>,
}

#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ ClawError::Unauthorized)]
    pub machine: Account<'info, Machine>,
    /// The new Core collection; a fresh keypair that signs the transaction.
    #[account(mut)]
    pub collection: Signer<'info>,
    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, seeds = [MACHINE_SEED, machine.authority.as_ref()], bump = machine.bump)]
    pub machine: Box<Account<'info, Machine>>,
    /// CHECK: system-owned vault PDA; pays refunds.
    #[account(mut, seeds = [VAULT_SEED, machine.key().as_ref()], bump = machine.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [PLAY_SEED, machine.key().as_ref(), player.key().as_ref()],
        bump = play.bump,
        has_one = player @ ClawError::NotPlayer,
        constraint = play.machine == machine.key() @ ClawError::InvalidPlay
    )]
    pub play: Box<Account<'info, Play>>,
    /// CHECK: the Core asset, created here at a deterministic PDA (unused on a refund). The game
    /// number is part of the seed: a `Play` is reused across games, so without it a player's
    /// second win would collide with their first prize.
    #[account(mut, seeds = [ASSET_SEED, play.key().as_ref(), &play.vrf_epoch.to_le_bytes()], bump)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: the prize receipt PDA, created here on a mint (unused on a refund).
    #[account(mut, seeds = [PRIZE_SEED, asset.key().as_ref()], bump)]
    pub prize: UncheckedAccount<'info>,
    /// CHECK: the machine's Core collection.
    #[account(mut, address = machine.collection @ ClawError::NoCollection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellBack<'info> {
    /// The asset's current owner.
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [MACHINE_SEED, machine.authority.as_ref()], bump = machine.bump)]
    pub machine: Box<Account<'info, Machine>>,
    /// CHECK: system-owned vault PDA; pays the sell-back.
    #[account(mut, seeds = [VAULT_SEED, machine.key().as_ref()], bump = machine.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: the Core asset; parsed and its owner checked in the handler.
    #[account(mut, owner = MPL_CORE_ID @ ClawError::InvalidAsset)]
    pub asset: UncheckedAccount<'info>,
    #[account(mut, seeds = [PRIZE_SEED, asset.key().as_ref()], bump = prize.bump)]
    pub prize: Account<'info, Prize>,
    /// CHECK: the machine's Core collection.
    #[account(mut, address = machine.collection @ ClawError::NoCollection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core program.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
